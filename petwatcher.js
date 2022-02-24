const base_url = "https://api.teamwood.games/*/api/"
const current_url = base_url+"user/current"
const watch_url = base_url+"versus/watch"
const battle_get_url = base_url+"battle/get/*"
const poll_period = 5000 //in milliseconds
const forbidden_headers = ["Accept-Charset", "Accept-Encoding", "Access-Control-Request-Headers", "Access-Control-Request-Method", "Connection", "Content-Length", "Cookie", "Cookie2", "Date", "DNT", "Expect", "Feature-Policy", "Host", "Keep-Alive", "Origin", "Proxy-", "Sec-", "Referer", "TE", "Trailer", "Transfer-Encoding", "Upgrade", "Via"]

console.log("Reloaded Super Auto Pets Ranked Watcher")

var version_number = "0.16"
var authorization = ""

var current_match = null
var match_history = []
var polling = false
var DisplayName = ""
var current_port = null

/* TODO:
   ignore player button
   update at start of match before first watch
   show pet list
   save match log
*/

//current -> get authorization, get polling data
//battle/get -> if dead, block next watch until end of match
//watch -> update player board, if eliminated, block and start polling with current until end of round

function get_version_number_and_authorization(e)
{
    const regex = /api\.teamwood\.games\/(.*)\/api/g;
    version_number = regex.exec(e.url)[1];

    for(let header of e.requestHeaders)
    {
        if(header.name == "Authorization")
        {
            authorization = header.value;
        }
    }
}

function get_points_lost(board)
{
    switch(board.LossPointsMode)
    {
        case 0: {
            if(board.Turn > 4) return 3;
            if(board.Turn > 2) return 2;
            return 1;
        }
        case 1: {
            return 1;
        }
        default:
    }
    return -8008135; //Make errors easier to spot
}

function update_match(match)
{
    console.log(match)
    if(match && match.Build)
    {
        let versus = match.Versus;
        let board = match.Build.Board

        if(!current_match || match.ParticipationId != current_match.ParticipationId)
        {
            console.log("starting new match")
            polling = false;
            already_polling = false;
            current_match = {
                submitted: false,
                completed: false,

                ParticipationId: match.ParticipationId,
                LobbyName: versus.Name,
                MaxLives: versus.MaxLives,
                LossPointsMode: board.LossPointsMode,
                rounds: [],
                player_list: {},
                CurrentTurn: 0,
                MatchState: 1
            };
        }
        let round = null
        if(current_match.CurrentTurn != versus.CurrentTurn
          || current_match.MatchState != match.MatchState)
        {
            round = {CurrentTurn: versus.CurrentTurn};
            current_match.rounds.push(round);

            let player = {
                DisplayName: DisplayName,
                Lives: board.LivesMax-board.LossPoints,
                Minions: board.Minions,
                Outcome: board.PreviousOutcome
            };
            if(board.Adjective && board.Noun)
            {
                player.BoardName = "The "+board.Adjective+" "+board.Noun;
            }

            //NOTE: this has a lot of duplicated data, could trim unchanging parts if it matters
            round.players = versus.Opponents.concat([player]);

            let n_remaining = 0;
            let eliminated_players = [];
            let remaining_player;
            for(let p of round.players)
            {
                if(!(p.DisplayName in current_match.player_list))
                {
                    current_match.player_list[p.DisplayName] = {
                        BoardName: p.BoardName,
                        turn_eliminated: null,
                        rank: null
                    }
                }
                current_match.player_list[p.DisplayName].Lives = p.Lives;
                if(p.Lives > 0)
                {
                    remaining_player = p.DisplayName;
                    console.log(p.DisplayName+" remains");
                    n_remaining += 1;
                }
                else
                {
                    if(current_match.player_list[p.DisplayName].turn_eliminated == null)
                    {
                        eliminated_players.push(p.DisplayName);
                        current_match.player_list[p.DisplayName].turn_eliminated = current_match.CurrentTurn;
                    }
                }
            }

            let rank = 1+n_remaining+0.5*(eliminated_players.length-1); //rank accounting for ties
            for(let DisplayName of eliminated_players)
            {
                current_match.player_list[DisplayName].rank = rank;
            }
            if(n_remaining == 1)
            {
                current_match.player_list[remaining_player].rank = 1;
            }

            if(n_remaining <= 1)
            {
                current_match.completed = true;
                match_history.push(current_match);
                polling = false;
                console.log("match completed")
            }

            current_match.CurrentTurn = versus.CurrentTurn
            current_match.MatchState = match.MatchState
        }

        if(current_port)
        {
            current_port.postMessage({type         : "match_update",
                                      current_match: current_match,
                                      match_history: match_history});
        }

        console.log(current_match)
    }
}

function send_current_request()
{
    let request = new XMLHttpRequest();
    let url = current_url.replace("*", version_number);
    request.open("GET", url);
    // console.log(request_current_headers);
    // for(let header of request_current_headers)
    // {
    //     if(!forbidden_headers.includes(header.name) && !header.name.startsWith("Proxy-") && !header.name.startsWith("Sec-"))
    //     {
    //         request.setRequestHeader(header.name, header.value);
    //     }
    // }
    console.log(url);
    console.log(authorization);
    request.setRequestHeader("Authorization", authorization);
    request.send();
}

// function start_polling()
// {
//     stop_polling(); //clear any remaining timers and queued flush requests

//     polling = true;
//     browser.alarms.create("poll_lobby", {periodInMinutes: poll_period});
//     browser.alarms.onAlarm.addListener(send_current_request);

// }
// function stop_polling()
// {
//     polling = false;
//     browser.alarms.clearAll();
// }

function check_current_request(e)
{
    console.log("current: ");
    if(e.method == "GET")
    {
        let filter = browser.webRequest.filterResponseData(e.requestId)
        let decoder = new TextDecoder("utf-8");
        let encoder = new TextEncoder();

        if(polling)
        {
            let data = [];
            filter.ondata = event => {
                data.push(event.data);
                filter.write(event.data);
            }

            filter.onstop = event => {
                let str = "";
                if (data.length == 1) {
                    str = decoder.decode(data[0]);
                }
                else {
                    for (let i = 0; i < data.length; i++) {
                        let stream = (i == data.length - 1) ? false : true;
                        str += decoder.decode(data[i], {stream});
                    }
                }
                console.log(str);
                response = JSON.parse(str);
                update_match(response.VersusMatches[0])
                filter.close();
            }
        }
        else
        {
            get_version_number_and_authorization(e);

            let data = [];
            filter.ondata = event => {
                data.push(event.data);
                filter.write(event.data);
            }

            filter.onstop = event => {
                let str = "";
                if (data.length == 1) {
                    str = decoder.decode(data[0]);
                }
                else {
                    for (let i = 0; i < data.length; i++) {
                        let stream = (i == data.length - 1) ? false : true;
                        str += decoder.decode(data[i], {stream});
                    }
                }
                response = JSON.parse(str);

                DisplayName = response.DisplayName;
                filter.close();
            }
        }

        // console.log(e);
    }
}

function battle_get_request(e)
{
    console.log("battle/get: ");
    get_version_number_and_authorization(e);
    if(e.method == "GET")
    {
        let filter = browser.webRequest.filterResponseData(e.requestId)
        let decoder = new TextDecoder("utf-8");
        let encoder = new TextEncoder();

        let data = [];
        filter.ondata = event => {
            data.push(event.data);
            filter.write(event.data);
        }

        filter.onstop = event => {
            let str = "";
            if (data.length == 1) {
                str = decoder.decode(data[0]);
            }
            else {
                for (let i = 0; i < data.length; i++) {
                    let stream = (i == data.length - 1) ? false : true;
                    str += decoder.decode(data[i], {stream});
                }
            }
            response = JSON.parse(str);
            console.log(response)
            DisplayName = response.User.DisplayName;
            if(response.Outcome == 2
               && response.UserBoard.LossPoints+get_points_lost(response.UserBoard) >= response.UserBoard.LivesMax)
            {
                polling = true;
                console.log("starting polling");
            }
            filter.close();
        }

        // console.log(e);
    }
}

var already_polling = false;

async function check_watch_request(e)
{
    console.log("watch: ");
    get_version_number_and_authorization(e);
    if(polling)
    {
        if(already_polling)
        {
            return {"cancel": true};
        }
        // watch_queue.push({e.url, e.requestHeaders});
        while(polling)
        {
            already_polling = true;
            console.log("polling: ");
            send_current_request()
            await new Promise(r => setTimeout(r, poll_period));
        }
        already_polling = false;
        console.log("done polling");
        // return {cancel:true};
    }
    else
    {
        if(e.method == "POST")
        {
            let filter = browser.webRequest.filterResponseData(e.requestId)
            let decoder = new TextDecoder("utf-8");
            let encoder = new TextEncoder();

            let data = [];
            filter.ondata = event => {
                data.push(event.data);
                filter.write(event.data);
            }

            filter.onstop = event => {
                let str = "";
                if (data.length == 1) {
                    str = decoder.decode(data[0]);
                }
                else {
                    for (let i = 0; i < data.length; i++) {
                        let stream = (i == data.length - 1) ? false : true;
                        str += decoder.decode(data[i], {stream});
                    }
                }
                response = JSON.parse(str);

                update_match(response.UserMatch)
                filter.close();
            }
        }
    }
}

browser.webRequest.onBeforeSendHeaders.addListener(
    check_current_request,
    {urls: [current_url]},
    ["blocking", "requestHeaders"]
);

browser.webRequest.onBeforeSendHeaders.addListener(
    battle_get_request,
    {urls: [battle_get_url]},
    ["blocking", "requestHeaders"]
);

browser.webRequest.onBeforeSendHeaders.addListener(
    check_watch_request,
    {urls: [watch_url]},
    ["blocking", "requestHeaders"]
);

function start_connection(port)
{
    current_port = port
}

browser.runtime.onConnect.addListener(start_connection);
