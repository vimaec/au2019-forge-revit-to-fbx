const async = require('async');
const Authenticator = require('./lib/authenticator');
const fs = require('fs');
const handlebar = require('handlebars');
const logger = require('./lib/logger');
const path = require('path');
const configFile = require('./config');
const storageUtils = require('./lib/storageUtils');
const workItemRunnerAbstract = require('./lib/workItemRunner');

const postWorkItemTemplateFileContent = fs.readFileSync('./templates/payloads/postWorkitemExportToFBX.hbs', 'utf8');
const postWorkItemTemplate = handlebar.compile(postWorkItemTemplateFileContent);
const OSSObjectNameInputPrefix = 'input-';
const OSSObjectNameOutputPrefix = 'output-';

class ExportToFBXRunner extends workItemRunnerAbstract {
    /**
     * Constructor
     * @param forgeOAuth2TwoLegged oauth2TwoLegged object from forgeSDK
     * @param config {Object}
     * @param config.urls.designAutomation {String} url to design automation
     */
    constructor(forgeOAuth2TwoLegged, config) {
        super(forgeOAuth2TwoLegged, config);
        this.nickname = config.forge.nickname;
        this.activityId = config.designAutomation.activityId;
        this.activityAlias = config.designAutomation.activityAlias;
    }

    /**
     *
     * @param jobId {String} job run unique identifier
     * @private
     */
    _getWorkItemPayload(jobId, nickname, callback) {
        const self = this;
        let inputUrl;

        async.waterfall([
                function getReadInputSignedUrl(next) {
                    storageUtils.getSignedUrl(self.forgeOAuth2TwoLegged, OSSObjectNameInputPrefix + jobId, 'read', next);
                },
                function getWriteOutputSignedUrl(url, next) {
                    inputUrl = url;
                    storageUtils.getSignedUrl(self.forgeOAuth2TwoLegged, OSSObjectNameOutputPrefix + jobId, 'write', next);
                },
                function resolveTemplate(url, next)
                {
                    const resolvedTemplate = postWorkItemTemplate({
                        activityId: nickname + '.' + self.activityId + '+' + self.activityAlias,
                        inputUrl: inputUrl,
                        outputUrl: url
                    });
                    next(null, resolvedTemplate);
                }
            ],
            callback
        );
    }

    /**
     *
     * @param jobId {String} job run unique identifier
     * @param callback {Function} callback(error)
     * @private
     */
    _initializeStorage(jobId, callback) {
        const self = this;
        logger.log('Initalizing storage...');
        logger.log('Creating OSS bucket if it does not exist...');
        storageUtils.createBucketIfDoesNotExist(
            self.forgeOAuth2TwoLegged,
            (err, bucketDetails) => {
                if (err && err.statusCode === 403) {
                    logger.log('Error creating the OSS bucket.  This is most likely because the name you chose for the bucket is already used by someone else. Change ossBucketName in the config file and try again');
                    process.exit(1);
                }
                if (err && err.statusCode === 400) {
                    logger.log('Error creating the OSS bucket.  This is most likely because the name you chose for the bucket contains illegal characters. Make sure ossBucketName in the config file is of that form [-_.a-z0-9]{3,128} ');
                    process.exit(1);
                }
                callback(err);
            }
        );
    }

    /**
     *
     * @param jobId {String} job run unique identifier
     * @private
     */
    _queueUploads(jobId, callback) {
        const self = this;
        async.waterfall([
            function generateInputUploadUrl(next) {
                storageUtils.getSignedUrl(self.forgeOAuth2TwoLegged, OSSObjectNameInputPrefix + jobId, 'write', next);
            },
            function addItemToUploadQueue(uploadUrl, next) {
                self.uploadQueue.push(
                    [
                        {
                            "url": uploadUrl,
                            "filePath": process.argv[2]
                        }
                    ]
                );
                next();
            }
        ], callback);
    }

    /**
     *
     * @param jobId {String} job run unique identifier
     * @param callback {Function} callback(error)
     * @private
     */
    _queueDownloads(jobId, callback) {
        const self = this;
        async.waterfall([
            function generateOutputDownloadUrl(next) {
                storageUtils.getSignedUrl(self.forgeOAuth2TwoLegged, OSSObjectNameOutputPrefix + jobId, 'read', next);
            },
            function addItemToUploadQueue(uploadUrl, next) {
                self.downloadQueue.push(
                    [
                        {
                            "url": uploadUrl,
                            "destination": path.join(__dirname, 'Results', jobId + '.fbx' ).split('\\').join('/')
                        }
                    ]
                );
                next();
            }
        ], callback);
    }
}

const authenticator = new Authenticator(configFile.forge.clientId, configFile.forge.clientSecret);
authenticator.getForgeOAuth2TwoLeggedObject((err, forgeOAuth2TwoLegged) => {
    if (err) {
        logger.log('Error while initializing forgeOAuth2TwoLegged object: ', err);
        process.exit(1);
    }
    const ExportToFBXRunnerInstance = new ExportToFBXRunner(forgeOAuth2TwoLegged, configFile);
    ExportToFBXRunnerInstance.run();
});

