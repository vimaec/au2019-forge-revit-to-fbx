const archiver = require('archiver');
const async = require('async');
const dasRequestUtils = require('./dasRequestUtils');
const FormData = require('form-data');
const fs = require('fs');
const handlebar = require('handlebars');
const logger = require('./logger');
const path = require('path');
const retryUtils = require('./retryUtils');
const _ = require('underscore');

const postAppTemplateContent = fs.readFileSync('./templates/payloads/postApp.hbs', 'utf8');
const postAppTemplate = handlebar.compile(postAppTemplateContent);

const postAliasTemplateFileContent = fs.readFileSync('./templates/payloads/postAlias.hbs', 'utf8');
const postAliasTemplate = handlebar.compile(postAliasTemplateFileContent);
const pathToAppBundle = path.join(__dirname , '../appBundle/export.bundle.zip');

class AppCreator {

    /**
     *
     * @param forgeOAuth2TwoLegged oauth2TwoLegged object from forgeSDK
     * @param config {Object}
     * @param config.urls.designAutomation {String} url to design automation
     */
    constructor(forgeOAuth2TwoLegged, config) {
        this.forgeOAuth2TwoLegged = forgeOAuth2TwoLegged;
        this.apigeeProxyUrl = config.urls.designAutomation;
    }

    _zipAppBundleFolder(folderToZip, pathToZipFile, callback) {
        const output = fs.createWriteStream(pathToZipFile);
        output.on('close', function() {
            callback();
        });
        const archive = archiver('zip', {
            zlib: {level: 9}
        });
        archive.on('error', function(err) {
            logger.log('Error while zipping the appbundle');
            logger.log('err');
            process.exit(1);
        });
        archive.pipe(output);
        archive.directory(folderToZip, 'exportToFBX.bundle');
        archive.finalize();
    }

    /**
     *
     * @param err {Object|String} err returned by request
     * @param resp {Object} response returned by request
     * @param body {Object} body returned by request
     * @private
     */
    _getErrorFromRequestResponse(err, resp, body) {
        return err || (resp.statusCode !== 200 ? "status code: " + resp.statusCode : null);
    }

    /**
     *
     * @param options {Object}
     *        options.engineId {String} forge engine id for which to create the app
     * @returns {String} payload
     * @private
     */
    _getPostAppPayload(options) {
        return postAppTemplate(options);
    }

    /**
     * @param options {Object}
     *        options.id {String} id to give to the alias
     *        options.version {String} version referenced by the alias
     *        options.accessToken {String} forge accessToken
     *        options.appId {String} name of the app
     * @private
     */
    _postAlias(options, callback) {
        const self = this;
        const payload = postAliasTemplate(options);
        retryUtils.exponentialBackoff(
            dasRequestUtils.postRequest,
            self._getErrorFromRequestResponse.bind(self),
            self.apigeeProxyUrl + '/appbundles/' + options.appId + '/aliases',
            options.accessToken,
            payload
        )(
            (err, resp, body) => {
                const errMsg = self._getErrorFromRequestResponse(err, resp, body);
                callback(errMsg);
            }
        );
    }

    /**
     * @param options {Object}
     *        options.appId {String} name of the app to create
     *        options.engineId {String} forge engine id for which to create the app
     *        options.accessToken {String} forge accessToken
     * @private
     */
    _postApp(options, callback) {
        const self = this;
        const payload = self._getPostAppPayload(options);
        retryUtils.exponentialBackoff(
            dasRequestUtils.postRequest,
            self._getErrorFromRequestResponse.bind(self),
            self.apigeeProxyUrl + '/appbundles',
            options.accessToken,
            payload
        )(
            (err, resp, body) => {
                const errMsg = self._getErrorFromRequestResponse(err, resp, body);
                if (errMsg) { callback(errMsg); return; }
                const parsedBody = JSON.parse(body);
                callback(null, parsedBody.uploadParameters);
            }
        );
    }

    /**
     *
     * @param err {Object|String} err returned by request
     * @param resp {Object} response returned by request
     * @param body {Object} body returned by request
     * @private
     */
    _getErrorFromDeleteRequest(err, resp, body) {
        return err || ( (resp.statusCode !== 204 && resp.statusCode !== 404)  ? "status code: " + resp.statusCode : null);
    }

    /**
     *
     * @param options {Object}
     *        options.accessToken {String} forge accessToken
     *        options.appId {String} forge app name
     * @param callback
     * @private
     */
    _deleteApp(options, callback) {
        const self = this;
        retryUtils.exponentialBackoff(
            dasRequestUtils.deleteRequest,
            self._getErrorFromDeleteRequest.bind(self),
            self.apigeeProxyUrl + '/appbundles/' + options.appId,
            options.accessToken
        )(
            (err, resp, body) => {
                const errMsg = self._getErrorFromDeleteRequest(err, resp, body);
                callback(errMsg);
            }
        )
    }

    /**
     *  Get a 2-legged token for forge authentication
     * @return {String} Bearer token for 2-legged forge authentication
     * @private
     */
    _getAccessToken() {
        return this.forgeOAuth2TwoLegged.getCredentials().access_token;
    }

    _uploadAppbundle(localPath, uploadParameters, callback) {
        const self = this;
        const form = new FormData();
        _.each(uploadParameters.formData, (element, index) => {
            form.append(index, element);
        });
        form.append('file', fs.readFileSync(localPath));
        retryUtils.exponentialBackoff(
            form.submit.bind(form),
            self._getErrorFromRequestResponse.bind(self),
            uploadParameters.endpointURL
        ) ((err, resp, body) => {
            callback(self._getErrorFromRequestResponse(err, resp, body));
        });
    }

    /**
     *
     * @param options {Object}
     *        options.clientId {String} forge clientId
     *        options.clientSecret {String} forge clientSecret
     *        options.appId {String} name of the app to create
     *        options.appAlias{String} alias to create for the app
     *        options.engineId {String} forge engine id for which to create the app
     *        options.pathToAppPackage {String} path to the package folder to zip and upload
     */
    createApp(options) {
        const self = this;
        const accessToken = self._getAccessToken();
        async.waterfall([
            function zipAppBundle(next) {
                logger.log('Zipping appbundle... ');
                self._zipAppBundleFolder(options.pathToAppPackage, pathToAppBundle, next);
            },
            function deleteAppIfExist(next) {
                logger.log('Deleting old app if it exist...');
                const params = {
                    accessToken: accessToken,
                    appId: options.appId
                };
                self._deleteApp(params, next);
            },
            function createAppVersion(next) {
                logger.log('Creating app version 1...');
                const params = {
                    appId: options.appId,
                    engineId: options.engineId,
                    accessToken: accessToken
                };
                self._postApp(params, next);
            },
            function uploadApp(uploadParameters, next)
            {
                logger.log('Uploading app package...');
                self._uploadAppbundle(pathToAppBundle, uploadParameters, next);
            },
            function createAppAlias(next) {
                logger.log('Creating app alias...');
                const params = {
                    id: options.appAlias,
                    version: 1,
                    appId: options.appId,
                    accessToken: accessToken
                };
                self._postAlias(params, next);
            }
        ], function(err) {
            if (err) {
                logger.log('ERROR: ' + err);
                process.exit(-1);
            }
            logger.log('Finished creating app');
            process.exit(0);
        });
    }
}

module.exports = AppCreator
