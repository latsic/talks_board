


const {createServer} = require("http");
const Router = require("./router");
const ecstatic = require("ecstatic");
const {writeFile} = require("mz/fs");
const {readFileSync} = require("fs");

const router = new Router();
const defaultHeaders = {"Content-Type": "text/plain"};

// A regex which handles the 'talks' route with a title.
// This can be used to add, delete or retrieve a talk.
 const talkPath = /^\/talks\/([^\/]+)$/;

// A regex which handles the 'talks' route with a comment.
// This can be used to add comments.
 const talkPathAddComment = /^\/talks\/([^\/]+)\/comments$/;

// A regex which handles the talks route without any
// further path elements.
const talksPath = /^\/talks$/;

/**
 * A server which routes all 'unknown' routes
 * to a static fileserver ('ecstatic') but has the
 * ability to route 'known' routes to a custom handler.
 * 
 * @class SkillShareServer
 */
class SkillShareServer {
    /**
     * Creates an instance of SkillShareServer.
     * 
     * @param {object} talks An object without a prototype.
     * @memberof SkillShareServer
     */
    constructor(talks) {
        this.talks = talks;
        
        /**
         * The version of the talks objects.
         * @type {number}
         */
        this.version = 0;
        /**
         * An array of open requests (long polling).
         * @type {array}
         */
        this.waiting = [];

        let fileServer = ecstatic({root: "./public"});
        this.server = createServer((request, response) => {
            let resolved = router.resolve(this, request);
            if(resolved) {

                resolved
                    .catch(error => {
                        if(error.status != null) return error;
                        return {body: String(error), status: 500};
                    })
                    .then(({ body,
                           status = 200,
                           headers = defaultHeaders}) => {
                        response.writeHead(status, headers);
                        response.end(body);
                    });
            }
            else {
                fileServer(request, response);
            }
        });
    }
    /**
     * Starts the server.
     * @param {number} port The port this server listens to. 
     * @memberof SkillShareServer
     */
    start(port) {

        this.loadTalks();
        this.server.listen(port);
    }
    /**
     * Stops this server.
     * @memberof SkillShareServer
     */
    stop() {
        this.server.close();
    }
    /**
     * Helper method.
     * @returns {object} Object containing data for the respons of
     *  a request to the talks url.
     * @memberof SkillShareServer
     */
    talkResponse() {
        let talks = [];
        for(let title of Object.keys(this.talks)) {
            talks.push(this.talks[title]);
        }
        return {
            body: JSON.stringify(talks),
            headers: {
                "Content-Type" : "application/json",
                "ETag" : `"${this.version}"`
            }
        }
    }
    /**
     * @param {number} time Waiting time in milliseconds
     * @returns {object} A Promise which resolves after a certain time.
     * @memberof SkillShareServer
     */
    waitForChanges(time) {
        return new Promise((resolve) => {
            this.waiting.push(resolve);
            setTimeout(() => {
                // The 'wait-time' is over for the reuqest in
                // question.

                // In case the promise has been resolved already.
                // This can happen if 'updated()' has been triggered.
                if(!this.waiting.includes(resolve)) return;
                // The waiting response will be triggered now, the
                // element can be removed.
                this.waiting = this.waiting.filter(elem => elem != resolve);
                // Nothing has changed. Therefore no new talks have to be
                // returned.
                return {
                    status: 304
                };
            }, time * 1000);
        });
    }
    /**
     * A change has been made to the talks object.
     * @memberof SkillShareServer
     */
    updated() {
        this.version++;
        let response = this.talkResponse();
        this.waiting.forEach(resolve => resolve(response));
        this.waiting = [];
        this.writeTalks();
    }
    /**
     * Loads talks data from disc.
     * @memberof SkillShareServer
     */
    loadTalks() {
        try {
            let jsonTalks = readFileSync("./talks.json", "utf8");
            // This is an object with a prototype.
            let obj = JSON.parse(jsonTalks);
            // The talks object must be an object without a prototype.
            this.talks = Object.assign(Object.create(null), obj);
        }
        catch(error) {

            if(error instanceof SyntaxError){
                console.log(`Bad talks data in file ${"talks.json"}, ${error.toString()}`);
            }
            else if(error.code != "ENOENT"){
                throw error;
            }
        }
    }
    /**
     * Writes talks data to disc.
     * @memberof SkillShareServer
     */
    writeTalks() {

        writeFile("./talks.json", JSON.stringify(this.talks), "utf8")
            .then(() => {
                console.log("writeTalks: ", "Talks successfulle written to disc.");
            })
            .catch((error) => {
                console.log("writeTalks: ", "Error: ", error);
            });
    }
}

// Adds the route to retrieve a talk.
router.add("GET", talkPath, async (server, title) => {

    if(title in server.talks) {
        return {
            body: JSON.stringify(server.talks[title]),
            headers: {"Content-Type": "application/json"}
        };
    }
    else {
        return {
            status: 404,
            body: `No talk '${title}' found`
        };
    }
});

// Adds a route to delete a talk.
router.add("DELETE", talkPath, async (server, title) => {
    if(title in server.talks) {
        delete server.talks[title];
        server.updated();
    }
    return {status: 204};
});

/**
 * Helper function to retrieve the content of a request body.
 * 
 * @param {object} stream A stream.
 */
function readStream(stream) {
    return new Promise((resolve, reject) => {
        let data = "";
        stream.on("error", (error) => {
            console.log("readStream error", error);
            reject(error);

        });
        stream.on("data", chunk => {
            console.log("readStream data", data);
            data += chunk.toString()
        });
        stream.on("end", () => {
            console.log("readStream end", data);
            resolve(data)
        });
    });
}
// Adds a route to add a talk.
router.add("PUT", talkPath, async (server, title, request) => {

    let requestBody = await readStream(request);
    let talk;
    try {
        talk = JSON.parse(requestBody);
    }
    catch(_) {
        return {
            status: 400,
            body: "Invalid JSON"
        };
    }

    if(!talk ||
       typeof talk.presenter != "string" ||
       typeof talk.summary != "string") {

        return {
            status: 400,
            body: "Bad talk data"
        };
    }

    server.talks[title] = {
        title,
        presenter: talk.presenter,
        summary: talk.summary,
        comments: []
    };

    server.updated();
    return {
        status: 204
    };
});

// Adds a comment to a talk.
router.add("POST", talkPathAddComment,
            async (server, title, request) => {
    
    let requestBody = await readStream(request);
    let comment;
    try {
        comment = JSON.parse(requestBody);
    }
    catch(_){
        return {
            status: 400,
            body: "Invalid JSON"
        };
    }

    if(!comment ||
       typeof comment.author != "string" ||
       typeof comment.message != "string") {

        return {
            status: 404,
            body: "Bad comment data"
        };
    }
    else if(title in server.talks) {
        server.talks[title].comments.push(comment);
        server.updated();
        return {
            status: 204
        };
    }
    else {
        return {
            status: 404,
            body: `No talk '${title}' found`
        };
    }
});

// Adds a route to retrieve all talks.
router.add("GET", talksPath, async (server, request) => {
    
    let tag = /"(.*)"/.exec(request.headers["if-none-match"]);
    let wait = /\bwait=(\d+)/.exec(request.headers["prefer"]);

    if(!tag || tag[1] != server.version) {
        return server.talkResponse();
    }
    else if(!wait){
        return {
            status: 304
        };
    }
    else {
        return server.waitForChanges(Number(wait[1]));
    }
});

let server = new SkillShareServer(Object.create(null));
server.start(8000);