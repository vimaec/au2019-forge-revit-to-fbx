const request = require('request');
class dasRequestUtils {
    static postRequest(url, accessToken, body, callback) {
        request.post(
            url,
            {
                body: body,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                }
            },
            callback
        );
    }

    static getRequest(url, accessToken, callback) {
        request.get(
            url,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                }
            },
            callback
        );
    }

    static deleteRequest(url, accessToken, callback) {
        request.delete(
            url,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + accessToken
                }
            },
            callback
        );
    }
}

module.exports = dasRequestUtils;