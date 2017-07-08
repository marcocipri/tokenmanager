'use strict';

const express = require('express');
var os = require("os");
var assert = require('assert');
var crypto = require('crypto');
var bodyParser = require('body-parser');
var consul = require('consul')({ host: '192.168.99.100' });

// retrieve the hostname
var hostname = os.hostname();

// tipe of encryption
var algorithm = 'aes256';
var inputEncoding = 'utf8';
var outputEncoding = 'hex';

// Network Constants
const PORT = 8080;
const HOST = '0.0.0.0';

// start values
var remoteKey = '';
var reloadTime = 10000;


// web App
const app = express();

// fields to check
var fields2check = ["username", "millis", "gametype", "reseller", "clientversion"];

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


function encrypt(string, key) {
    var cipher = crypto.createCipher(algorithm, key);
    var ciphered = cipher.update(string, inputEncoding, outputEncoding);
    ciphered += cipher.final(outputEncoding);
    return ciphered;
}

function decrypt(token, key) {
    try {
        var decipher = crypto.createDecipher(algorithm, key);
        var deciphered = decipher.update(token, outputEncoding, inputEncoding);
        deciphered += decipher.final(inputEncoding);
    } catch (err) {
        console.log(' decrypt impossible for wrong key ');
        deciphered = "KO";
    }
    return deciphered;
}

// http://localhost:49160/encrypt?string=ciccio
app.get('/encrypt', function(req, res) {
    var token = encrypt(req.query.string, remoteKey);
    res.send('encrypt\n string ' + req.query.string + '\n token ' + token);
});

// http://localhost:49160/decrypt?string=ce607f078
app.get('/decrypt', function(req, res) {
    var clear = decrypt(req.query.string, remoteKey);
    res.send('decrypt\n string ' + req.query.string + '\n token ' + clear);
});

app.post("/verify", function(req, res) {
    if (!req.body.username || !req.body.token || !req.body.millis || !req.body.gametype || !req.body.reseller) {
        return res.send({ "status": "error", "message": "missing a parameter" });
    } else {
        var clear = decrypt(req.body.token, remoteKey);
        if (clear == 'KO') return res.send({ "result": 'KO', "baker": hostname });

        var clearJSON = JSON.parse(clear);
        var result = 'OK';
        var arrayLength = fields2check.length;
        for (var i = 0; i < arrayLength; i++) {
            if (req.body[fields2check[i]] != clearJSON[fields2check[i]]) result = 'KO';
        }
        return res.send({ "result": result, "baker": hostname });
    }
});


app.post("/generate", function(req, res) {
    console.log(' remoteKey ' + remoteKey);
    if (!req.body.username || !req.body.clientversion || !req.body.millis || !req.body.gametype || !req.body.reseller) {
        return res.send({ "status": "error", "message": "missing a parameter" });
    } else {
        var token = encrypt(JSON.stringify(req.body), remoteKey);
        return res.send({ "sessionID": token, "baker": hostname });
    }

});



// update the encrypt key every 10 secs.

function confUpdate(arg) {
    try {
        consul.kv.get('environment/test/token/encrypt-key', function(err, _remoteKey) {
            if (err) console.log(' err ' + err);;
            if (_remoteKey == null) {
                remoteKey = "";
                reloadTime = 10000;
            } else {
                console.log(' _remotekey int ' + _remoteKey.Value);
                var _remoteKeyJSON = JSON.parse(_remoteKey.Value);
                remoteKey = _remoteKeyJSON.key;
                reloadTime = _remoteKeyJSON.reloadTime;
            }
        });
    } catch (error) {
        console.log(' error ' + error.stringify);
    }
    setTimeout(confUpdate, reloadTime, '');
}

confUpdate('');

app.listen(PORT, HOST);
console.log('Running on http://' + HOST + ':' + PORT);