const retry = require('retry');

const RETRY_OPTIONS = {
    retries: 5,
    factor: 2,
    minTimeout: 100,
    maxTimeout: 2000,
    randomize: true
};

class retryUtils {
     /**
     * exponentialBackoff
     *
     * Utility function to apply exponential backoff retry on a function if need be.
     *
     * @param asyncRequestFunction {Function} function on which to apply exponential backoff.
     *                          asyncFunction(params, callback)
     *                              @param params {Object} parameters
     *                              @param callback {Function} callback function
     *                                 @param err {Object} the error of the last execution
     *                                 @param response {Object} the data from the last execution
     *                                 @param body {Object} the data from the last execution
     *
     * @param getErrorFunction {Function} function that return an error string of null
     *
     * @param params {Object} params object to be passed to asyncFunction as the first argument
     * @return {Function} return a retryable function of the asyncFunction
     *                        retryableFunction(callback)
     *                          @param callback {Function} callback function
     *                             @param err {Object} the error of the last execution
     *                             @param response {Object} the data from the last execution
     *                             @param body {Object} the data from the last execution
     */
   static exponentialBackoff(asyncFunction, getErrorFunction, ...params) {
        const operation = retry.operation(RETRY_OPTIONS);

        return function (callback) {
            operation.attempt(function () {
                asyncFunction(...params, function (...args) {
                    if (operation.retry(getErrorFunction(...args))) {
                        return;
                    }
                    callback(...args);
                });
            });
        };
    }
}

module.exports = retryUtils;