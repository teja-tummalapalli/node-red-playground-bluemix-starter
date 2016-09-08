/**
 * Copyright 2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
module.exports = function(RED) {
    "use strict";

    var bodyParser = require("body-parser");
    var cookieParser = require("cookie-parser");
    var jsonParser = bodyParser.json();
    var urlencParser = bodyParser.urlencoded({extended:true});

    var http = require('http');
    var querystring = require('querystring');

    function PlaygroundNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        var code = n.code || "";
        var mode = n.mode || "node";
        var defaults = n.params || {};
        var url = n.url;

        this.on("input", function(msg) {
            var params = {};
            var payload = msg.payload;
            if (typeof payload == "object") {
            	params = payload;
            	for (var i in defaults) {
                    params[defaults[i].key] = defaults[i].value;
            	}
            } else {
            	params.payload = payload;
            }
            executeParams(url, mode, code, params, function(data) {
                msg.payload = data;
                node.send(msg);
                node.status({});
            });
        });

        HTTPIn(node, n);
    }
    RED.nodes.registerType("playground", PlaygroundNode);


    function execute(host, mode, code, cb) {
        if (code != "") {
            host = host || 'cloudsandbox.mybluemix.net';
            host = host.replace("http://", "");
            if (host == "") host = 'cloudsandbox.mybluemix.net';
        
            var mode = detectMode(code, mode);

            var post_data = querystring.stringify({
                'code': code,
                'language': mode
            });

            var post_options = {
                host: host,
                port: '80',
                path: '/exec',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(post_data)
                }
            };

            var post_req = http.request(post_options, function(post_res) {
                post_res.setEncoding('utf8');
                post_res.on('data', function(data) {
                    console.log("result : " + data);
                    if (data.indexOf("err") > -1 && data.indexOf("out") > -1)
                        try {
                            cb(JSON.parse(data));
                        } catch (e) {
                            cb({err: data, out: ""});
                        }
                    else
                        cb({err: data, out: ""});
                });
            });

            post_req.on('error', function(err) {
                console.log(err);
                cb({err: err, out: ""});
            });

            post_req.write(post_data);
            post_req.end();
        }
    }

    function executeParams(host, mode, code, params, cb) {
        var mode = detectMode(code, mode);

        if (mode == "node") {
            var paramLines = "var parameters = " + JSON.stringify(params) + ";\n\n";
            execute(host, mode, paramLines + code, cb);
        } else if (mode == "java") {
            execute(host, mode, code, cb);
        }
    }

    // detect mode from both the code and the selected mode
    function detectMode(code, mode) {
        if (code.indexOf("public static void main") > -1 || code.indexOf("System.out.print") > -1)
            return "java";
        else if (code.indexOf("console.log") > -1)
            return "node";

        return mode || "node";
    }

    // from core/io/httpin.js
    function HTTPIn(node, n) {
        var skip = function(req,res,next) { next(); }

        node.callback = function(req,res) {
            var msgid = RED.util.generateId();
            res._msgid = msgid;

            var host = req.body.host || "cloudsandbox.mybluemix.net";
            var code = req.body.code || "";
            var mode = detectMode(code, req.body.mode);

            execute(host, mode, code, function(data) {
                var msg = {
                    _msgid: msgid,
                    req: req,
                    res: res,
                    payload: data
                };
                node.send(msg);
                node.status({});
                res.send(data);
            });
        };

        node.errorHandler = function(err,req,res,next) {
            node.warn(err);
            res.send({err:err,out:""});
        };

        RED.httpNode.post("/playground_exec",cookieParser(),skip,skip,skip,jsonParser,urlencParser,skip,node.callback,node.errorHandler);
    }
}
