
const {parse} = require("url");


/**
 * A class to route different request urls.
 * Each route is defined by a method, a regular
 * expression (to identify the route) and a
 * request method.
 * 
 * @class Router
 */
module.exports = class Router {

    /**
     * Creates an instance of Router.
     * Initializes an empty array of routes.
     */
    constructor() {
        this.routes = [];
    }
    /**
     * Adds a route.
     * 
     * @param {String} method POST, GET, etc.
     * @param {RegEx} urlRegEx Example: /^\/talks\/([^\/]+)$/
     * @param {function} handler The handler for the route. 
     */
    add(method, urlRegEx, handler) {

        this.routes.push({method, urlRegEx, handler});
    }
    /**
     * Returns a handler function for the given request
     * if the required handler exists, null otherwise.
     * 
     * @param {object} context 
     * @param {object} request The request to be routed.
     * @returns {function} A handler function for the request
     *  if one has been found, null otherwise.
     */
    resolve(context, request) {
        let path = parse(request.url).pathname;

        for(let {method, urlRegEx, handler} of this.routes) {
            
            // If the url does not match or if the request
            // method does not match, this route is not the
            // correct one. 
            let match = urlRegEx.exec(path);
            if(!match || request.method != method) continue;

            // Example: localhost:8000/talks/SomeNew%20Talk/aMessage
            // urlParts = [SomeNew Talk, aMessage]
            // The method 'decodeURIComponent' is used to handle
            // escaped characters (like spaces) in the uri.
            let urlParts = match.slice(1).map(decodeURIComponent);
            return handler(context, ...urlParts, request);
        }
        // No route found.
        return null;
    }
}