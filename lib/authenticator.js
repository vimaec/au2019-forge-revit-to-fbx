const forgeSDK = require('forge-apis');
class Authenticator {
    /**
     * Constructor
     * @param clientId {String} forge client id
     * @param clientSecret {String} forge client secret
     */
    constructor(clientId, clientSecret) {
        this._clientId = clientId;
        this._clientSecret = clientSecret;
    }

    /**
     *
     * @param callback {Function} callback(error)
     * @private
     */
    _setupAuthClientTwoLegged(callback) {
        if (this._forgeOAuth2TwoLegged) {
            callback();
        }
        this._forgeOAuth2TwoLegged = new forgeSDK.AuthClientTwoLegged(
            this._clientId,
            this._clientSecret,
            [
                // To use design automation
                'code:all',

                // To create and list OSS bucket
                'bucket:create',
                'bucket:read',

                // To read/write data from OSS bucket
                'data:read',
                'data:write'
            ],
            true
        );
        this._forgeOAuth2TwoLegged.authenticate().then((credentials) => {callback(null);}, callback)
    }

    /**
     *
     * @param callback {Function} callback(error, forgeOauth2TwoLeggedObject)
     */
    getForgeOAuth2TwoLeggedObject(callback) {
        this._setupAuthClientTwoLegged((err) => {
            callback(err, this._forgeOAuth2TwoLegged)
        });
    }
}

module.exports = Authenticator;