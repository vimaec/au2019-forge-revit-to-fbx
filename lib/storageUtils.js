const config = require('../config');
const ForgeSDK = require('forge-apis');
const BucketsApi = new ForgeSDK.BucketsApi();
const ObjectsApi = new ForgeSDK.ObjectsApi();
const bucketKey = config.forge.ossBucketName;

class storageUtils {

    /**
     *
     * @param oAuth2TwoLegged {object} oAuth2TwoLegged object from forge sdk
     * @param callback {Function}
     */
    static getBucketDetails (oAuth2TwoLegged, callback) {
        BucketsApi.getBucketDetails(bucketKey, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials()).then((resp) => {
            callback(null, resp.body);
        }, callback);
    }

    /**
     *
     * @param oAuth2TwoLegged {object} oAuth2TwoLegged object from forge sdk
     * @param callback {Function}
     */
    static createBucket(oAuth2TwoLegged, callback) {
        const createBucketJson = {'bucketKey': bucketKey, 'policyKey': 'temporary'};
        BucketsApi.createBucket(createBucketJson, {}, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials()).then(
            (resp) => {
                callback(null, resp.body);
            },
            callback
        );
    }

    /**
     *
     * @param oAuth2TwoLegged {object} oAuth2TwoLegged object from forge sdk
     * @param callback {Function}
     */
    static createBucketIfDoesNotExist(oAuth2TwoLegged, callback) {
        storageUtils.getBucketDetails(oAuth2TwoLegged, (err, bucketDetails) => {
            if (err && err.statusCode === 404) {
                storageUtils.createBucket(oAuth2TwoLegged, callback);
                return;
            }
            callback(err, bucketDetails);
        });
    }

    /**
     *
     * @param oAuth2TwoLegged {object} oAuth2TwoLegged object from forge sdk
     * @param objectName {String} name of the object in OSS
     * @param access {String} access rights for oss read | write | readwrite
     * @param callback
     */
    static getSignedUrl(oAuth2TwoLegged, objectName, access, callback) {
        ObjectsApi.createSignedResource(bucketKey, objectName, {}, {access: access}, oAuth2TwoLegged, oAuth2TwoLegged.getCredentials()).then (
            (resp) => {
                callback(null, resp.body.signedUrl);
            },
            callback
        )
    }
}

module.exports = storageUtils;