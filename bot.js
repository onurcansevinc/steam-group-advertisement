const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const steamgroup = require('node-steam-group');
var TradeofferManager = require('steam-tradeoffer-manager');
const fs = require('fs');
const config = require('./config.json');

let didLogin = false;
let timeouts = {};
let client = new SteamUser();
let community = new SteamCommunity();
let manager = new TradeofferManager({
    steam: client,
    "language": "en",
    "cancelTime": 24 * 60 * 60000
});
login();

function login() {
    try {
        if (didLogin) return client.logOn(true);
        client.logOn({
            "accountName": config.username,
            "password": config.password
        });
        console.log('Connecting to Steam..');
    } catch (e) {}
}

function webLogin() {
    try {
        client.webLogOn();
    } catch (e) {}
}

function checkSteamLogged() {
    community.loggedIn((err, loggedIn) => {
        if (err) {
            setTimeout(() => checkSteamLogged(), moment.duration(5, "seconds"));
            return;
        }
        if (!loggedIn) {
            console.log("checkSteamLogged(): Session expired!");
            webLogin();
            return;
        }
    });
}

client.on('loggedOn', function (details) {
    didLogin = true;
    console.log("Logged into Steam as " + client.steamID.getSteam3RenderedID());
    client.setPersona(SteamUser.EPersonaState.Online);
    client.gamesPlayed(config.gamePlaying);
});

client.on('error', e => {
    switch (e.eresult) {
        case SteamUser.EResult.AccountDisabled:
            console.log(`This account is disabled!`);
            break;
        case SteamUser.EResult.InvalidPassword:
            console.log(`Invalid Password detected!`);
            break;
        case SteamUser.EResult.RateLimitExceeded:
            console.log(`Rate Limit Exceeded, trying to login again in 5 minutes.`);
            timeouts['login_timeout'] = setTimeout(function () {
                login();
                clearTimeout(timeouts['login_timeout']);
            }, moment.duration(5, "minutes"));
            break;
        case SteamUser.EResult.LogonSessionReplaced:
            console.log(`Unexpected Disconnection!, you have LoggedIn with this same account in another place..`);
            console.log(`trying to login again in a sec.`);
            timeouts['login_timeout'] = setTimeout(function () {
                login();
                clearTimeout(timeouts['login_timeout']);
            }, 5000);
            break;
        default:
            console.log("Unexpected Disconnection!, trying to login again in a sec.");
            timeouts['login_Unexpected'] = setTimeout(function () {
                login();
                clearTimeout(timeouts['login_Unexpected']);
            }, 5000);
            break;
    }
});

community.on('sessionExpired', () => webLogin());

client.on('webSession', function (sessionID, cookies) {
    console.log("Got web session");
    manager.setCookies(cookies, (err) => {
        if (err) {
            return console.log("An error occurred while setting cookies:" + err);
        } else {
            setTimeout(doComment, 30000);
        }
    });
    clearInterval(timeouts['CheckL_i']);
    timeouts['CheckL_i'] = setInterval(checkSteamLogged, moment.duration(10, "minutes"));
});

client.on('accountLimitations', function (limited, communityBanned, locked, canInviteFriends) {
    var limitations = [];
    if (limited) {
        limitations.push('LIMITED');
    } else if (communityBanned) {
        limitations.push('COMMUNITY BANNED');
    } else if (locked) {
        limitations.push('LOCKED');
    } else if (limitations.length === 0) {
        console.log("Our account has no limitations.");
    } else {
        console.log("Our account is " + limitations.join(', ') + ".");
    }
});

client.on('vacBans', function (numBans, appids) {
    console.log("We have " + numBans + " VAC ban" + (numBans == 1 ? '' : 's') + ".");
    if (appids.length > 0) {
        console.log("We are VAC banned from apps: " + appids.join(', '));
    }
});

function doComment(){
    console.log('Comment function started.')
    const groups = fs.readFileSync('groups.txt').toString().trim().split('\n');
    groups.forEach((group, index) => {
        setTimeout(async function () {
            steamgroup.getstats(group, function(groupInfo, err){
                if(err){
                    console.log(err);
                    throw err;
                } else {
                    community.postGroupComment(groupInfo.id, config.comment, async function(err) {
                        if (err) {
                            console.log('An error occurred while trying the comment');
                            throw err;
                        } else {
                            console.log('Done');
                        }
                    });
                }
            });
            if (index == groups.length - 1) {
                setTimeout(() => {
                    doComment();
                }, config.timeoutRestartComments * 60000);
            }
        }, index * config.timeoutBetweenComments * 60000);
    }); 
}
