const async = require('async');
const dasRequestUtils = require('./dasRequestUtils');
const fs = require('fs');
const handlebar = require('handlebars');
const logger = require('./logger');
const retryUtils = require('./retryUtils');

const postAliasTemplateFileContent = fs.readFileSync('./templates/payloads/postAlias.hbs', 'utf8');
const postAliasTemplate = handlebar.compile(postAliasTemplateFileContent);

class ActivityCreator {
    /**
     *
     * @param forgeOAuth2TwoLegged oauth2TwoLegged object from forgeSDK
     * @param config {Object}
     * @param config.urls.designAutomation {String} url to design automation
     * @private
     */
    constructor(forgeOAuth2TwoLegged, config) {
        this.forgeOAuth2TwoLegged = forgeOAuth2TwoLegged;
        this.apigeeProxyUrl = config.urls.designAutomation;
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
     *        options.id {String} id to give to the alias
     *        options.version {String} version referenced by the alias
     *        options.accessToken {String} forge accessToken
     *        options.activityId {String} name of the activity
     * @private
     */
    _postAlias(options, callback) {
        const self = this;
        const payload = postAliasTemplate(options);
        retryUtils.exponentialBackoff(
            dasRequestUtils.postRequest,
            self._getErrorFromRequestResponse.bind(self),
            self.apigeeProxyUrl + '/activities/' + options.activityId + '/aliases',
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
     *
     * @param options {Object}
     *        options.activityId {String} name of the activity to create
     *        options.engineId {String} forge engine id for which to create the activity
     *        options.accessToken {String} forge accessToken
     *        options.activityPayloadTemplate {Object} compiled template for activity payload
     *        options.appId {String} name of the app created with the application plugin
     *        options.appAlias {String} alias referencing the application package
     *        options.nickname {String} Design Automation nickname
     * @private
     */
    _postActivity(options, callback) {
        const self = this;
        const payload = options.activityPayloadTemplate(options);
        retryUtils.exponentialBackoff(
            dasRequestUtils.postRequest,
            self._getErrorFromRequestResponse.bind(self),
            self.apigeeProxyUrl + '/activities',
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
     *
     * @param options {Object}
     *        options.accessToken {String} forge accessToken
     * @private
     */
    _getNickname(options, callback) {
        const self = this;
        retryUtils.exponentialBackoff(
            dasRequestUtils.getRequest,
            self._getErrorFromRequestResponse.bind(self),
            self.apigeeProxyUrl + '/forgeapps/me',
            options.accessToken
        )(
            (err, resp, body) => {
                const errMsg = self._getErrorFromRequestResponse(err, resp, body);
                callback(errMsg, JSON.parse(body));
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
     *        options.activityId {String} forge activity name
     * @param callback
     * @private
     */
    _deleteActivity(options, callback) {
        const self = this;
        retryUtils.exponentialBackoff(
            dasRequestUtils.deleteRequest,
            self._getErrorFromDeleteRequest.bind(self),
            self.apigeeProxyUrl + '/activities/' + options.activityId,
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

    /**
     *
     * @param options {Object}
     *        options.clientId {String} forge clientId
     *        options.clientSecret {String} forge clientSecret
     *        options.appId {String} name of the app created with the application plugin
     *        options.appAlias {String} alias referencing the application package
     *        options.activityId {String} name of the activity to create
     *        options.activityAlias{String} alias to create for the activity
     *        options.engineId {String} forge engine id for which to create the activity
     *        options.activityPayloadTemplate {Object} compiled template for activity payload
     */
    createActivity(options) {
        const self = this;
        const accessToken = self._getAccessToken();
        let nickname;
        async.waterfall([
            function getNickname(next) {
                // This is only a necessary step if the user has setup a nickname in Design Automation
                // Otherwise we could have directly used the appId
                self._getNickname({
                    accessToken: accessToken
                }, (err, returnedNickname) => {
                    nickname = returnedNickname;
                    next(err);
                });
            },
            function deleteActivityIfExist(next) {
                logger.log('Deleting old activity if it already exist...');
                const params = {
                    accessToken: accessToken,
                    activityId: options.activityId
                };
                self._deleteActivity(params, next);
            },
            function createActivityVersion(next) {
                logger.log('Creating activity version 1...');
                const params = {
                    activityId: options.activityId,
                    engineId: options.engineId,
                    accessToken: accessToken,
                    nickname: nickname,
                    appId: options.appId,
                    appAlias: options.appAlias,
                    activityPayloadTemplate: options.activityPayloadTemplate
                };
                self._postActivity(params, next);
            },
            function createActivityAlias(next) {
                logger.log('Creating alias...');
                const params = {
                    id: options.activityAlias,
                    version: 1,
                    activityId: options.activityId,
                    accessToken: accessToken
                };
                self._postAlias(params, next);
            }
        ], function(err) {
            if (err) {
                logger.log('ERROR: ' + err);
                process.exit(-1);
            }
            logger.log('Finished creating activity');
            process.exit(0);
        });
    }
}

module.exports = ActivityCreator;
