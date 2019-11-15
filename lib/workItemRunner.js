const async = require('async');
const dasRequestUtils = require('./dasRequestUtils');
const fs = require('fs');
const logger = require('./logger');
const mkdirp = require('mkdirp');
const path = require('path');
const retryUtils = require('./retryUtils');
const request = require('request');
const uuidv4 = require('uuid/v4');

class workItemRunnerAbstract {
    /**
     * Constructor
     * @param forgeOAuth2TwoLegged oauth2TwoLegged object from forgeSDK
     * @param config {Object}
     * @param config.urls.designAutomation {String} url to design automation
     */
    constructor(forgeOAuth2TwoLegged, config) {
        this.apigeeProxyUrl = config.urls.designAutomation;
        this.timeBetweenPolls = config.timeBetweenPolls;
        this.forgeOAuth2TwoLegged = forgeOAuth2TwoLegged;

        this.downloadQueue = async.queue(
            function downloadFile(task, callback) {
                const dir = path.dirname(task.destination);
                mkdirp(dir, (err) => {
                    if (err) {
                        callback(err);
                        return;
                    }
                    request(task.url)
                        .pipe(fs.createWriteStream(task.destination))
                        .on('finish', callback);
                });
            },
            7
        );

        this.downloadQueue.error((err) => {
            logger.log('ERROR DOWNLOADING OUTPUT: ' + err);
            process.exit(-1);
        });

        this.uploadQueue = async.queue(
            function uploadFile(task, callback) {
                request({
                    url: task.url,
                    method: 'PUT',
                    body: fs.readFileSync(task.filePath)
                }, callback);
            },
            7
        );

        this.uploadQueue.error((err) => {
            logger.log('ERROR UPLOADING INPUT: ' + err);
            process.exit(-1);
        });
    }

    /**
     *
     * @param jobId {String} job run unique identifier
     * @param callback {Function} callback(error)
     * @private
     */
    _queueDownloads(jobId, callback) {
        throw new TypeError('Not implemented for WorkItemRunnerAbstract');
    }

    /**
     *
     * @param jobId {String} job run unique identifier
     * @private
     */
    _queueUploads(jobId, callback) {
        throw new TypeError('Not implemented for WorkItemRunnerAbstract');
    }

    /**
     *
     * @param jobId {String} job run unique identifier
     * @param callback {Function} callback(error)
     * @private
     */
    _initializeStorage(jobId, callback) {
        throw new TypeError('Not implemented for WorkItemRunnerAbstract');
    }

    /**
     *
     * @param jobId {String} job run unique identifier
     * @private
     */
    _getWorkItemPayload(jobId, nickname, callback) {
        throw new TypeError('Not implemented for WorkItemRunnerAbstract');
    }

    /**
     *
     *  Get a 2-legged token for forge authentication
     * @return {String} Bearer token for 2-legged forge authentication
     * @private
     */
    _getAccessToken() {
        return this.forgeOAuth2TwoLegged.getCredentials().access_token;
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
     * @param accessToken {String} 2 legged forge authentication token
     * @param payload {string} payload to send
     * @param callback {Function}
     * @private
     */
    _postWorkItem(accessToken, payload, callback) {
        const self = this;
        retryUtils.exponentialBackoff(
            dasRequestUtils.postRequest,
            self._getErrorFromRequestResponse.bind(self),
            self.apigeeProxyUrl + '/workitems',
            accessToken,
            payload
        )(
            (err, resp, body) => {
                const errMsg = self._getErrorFromRequestResponse(err, resp, body);
                if (errMsg) {
                    callback(errMsg);
                    return;
                }
                const parsedBody = JSON.parse(body);
                callback(null, parsedBody.id);
            }
        );
    }

    /**
     *
     * @param accessToken {String} forge accessToken
     * @param workItemId {String} the id of the workitem
     * @param callback(err)
     * @private
     */
    _getWorkItemStatus(accessToken, workItemId, callback) {
        const self = this;
        retryUtils.exponentialBackoff(
            dasRequestUtils.getRequest,
            self._getErrorFromRequestResponse.bind(self),
            self.apigeeProxyUrl + '/workitems/' + workItemId,
            accessToken
        )(callback);
    }

    /**
     *
     * @param accessToken {String} forge accessToken
     * @param workItemId {String} the id of the workitem
     * @param callback(err)
     * @private
     */
    _waitForWorkItem(accessToken, workItemId, callback) {
        const self = this;
        let parsedBody;
        const startWait = new Date();
        async.doWhilst(
            function checkForCompletionStatus(whilstCallback) {
                setTimeout(() => {
                    self._getWorkItemStatus(accessToken, workItemId, (err, resp, body) => {
                            const errMsg = self._getErrorFromRequestResponse(err, resp, body);
                            if (errMsg) {
                                logger.log('GET STATUS ERR:' + errMsg);
                                whilstCallback(errMsg);
                                return;
                            }
                            parsedBody = JSON.parse(body);
                            whilstCallback();
                        }
                    )
                }, self.timeBetweenPolls);
            },
            function checkWorkItemStatusComplete() {
                logger.log('Checking status: ' + parsedBody.status + ' ' + (Date.now() - startWait) + ' ms');
                return parsedBody.status === 'pending' || parsedBody.status === 'inprogress';
            },
            () => {
                if (parsedBody.reportUrl) {
                    logger.log('Log file available here: ' + parsedBody.reportUrl)
                }

                if (parsedBody.status !== 'success') {
                    callback('Workitem finished with status: ' + parsedBody.status);
                    return;
                }
                callback();
            }
        );
    }

    /**
     *
     * @param payload {String} postWorkItemPayload
     * @param callback {Function} callback(err)
     * @private
     */
    _sendWorkItemAndWaitToComplete(accessToken, payload, callback) {
        let workItemId;
        const self = this;
        async.waterfall([
            function sendWorkItem(next) {
                self._postWorkItem(accessToken, payload, (err, id) => {
                        logger.log('Posted workitem id: ' + id);
                        workItemId = id;
                        next(err);
                    }
                );
            },
            function waitWorkItemToComplete(next) {
                self._waitForWorkItem(accessToken, workItemId, next);
            }
        ], callback);
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
     * @param jobId
     * @param callback
     * @private
     */
    _executeWorkItemAndQueueDownloads(jobId, callback) {
        const self = this;
        const accessToken = self._getAccessToken();
        async.waterfall(
            [
                function getNickname(next) {
                    // This is only a necessary step if the user has setup a nickname in Design Automation
                    // Otherwise we could have directly used the appId
                    self._getNickname({
                        accessToken: accessToken
                    }, next);
                },
                function getWorkItemPayload(nickname, next) {
                    self._getWorkItemPayload(jobId, nickname, next);
                },
                function sendAndWaitForWorkitem(workitemPayload, next) {
                    self._sendWorkItemAndWaitToComplete(accessToken, workitemPayload, next);
                },
                function queueDownloads(next) {
                    self._queueDownloads(jobId, next);
                }
            ],
            callback
        );
    }

    run(forcedJobId) {
        const self = this;
        const jobId = forcedJobId || uuidv4();
        logger.log('JOB ID: ' + jobId);
        async.waterfall(
            [
                function initializeStorage(next) {
                    self._initializeStorage(jobId, next);
                },
                function queueUpload(next) {
                    self._queueUploads(jobId, next);
                },
                function waitForUploadToFinish(next) {
                    if (self.uploadQueue.length() === 0 && !self.uploadQueue.running()) {
                        next();
                        return;
                    }
                    logger.log('Waiting for uploads to finish ...');
                    self.uploadQueue.drain = next;
                },
                function executeWorkItem(next) {
                    logger.log('Starting workitem ...');
                    self._executeWorkItemAndQueueDownloads(jobId, next);
                },
                function waitDownloadToComplete(next) {
                    if (self.downloadQueue.length() === 0 && !self.downloadQueue.running()) {
                        next();
                        return;
                    }
                    logger.log('Waiting for downloads to finish ...');
                    self.downloadQueue.drain = next;
                }
            ],
            (err) => {
                if (err) {
                    logger.log('Job ' + jobId + ' Stopped because of error: ');
                    logger.log(err);
                    process.exit(1);
                }
                logger.log('job ' + jobId + ' Finished');
                process.exit(0);
            }
        );
    }
}

module.exports = workItemRunnerAbstract
