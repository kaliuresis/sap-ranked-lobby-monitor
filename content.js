var style_sheet = document.createElement("style");
style_sheet.type = "text/css";
style_sheet.innerText = `
.ranked_match_info
{
margin: 20px;
}

.teamlist td, .teamlist th
{
padding-left: 1em;
padding-right: 1em;
text-align: center;
}

.submit_code
{
position: relative;
top:1em;
}

#submit_text
{
display: inline-block;
background-color: #191919;
min-width: 50em;
padding: 0.5em;
border-radius: 0.5em 0 0 0.5em;
}

#copy_button
{
display: inline-block;
color: white;
padding: 0.5em;
background-color: #555555;
height: 100%;
position: absolute;
border:none;
border-radius: 0 0.5em 0.5em 0;
}

#copy_button:hover
{
background-color: #5D5D5D;
}
#copy_button:active
{
background-color: #101010;
}

#copy_button .tooltip {
  visibility: hidden;
  width: 5em;
  background-color: #555555;
  color: white;
  text-align: center;
  border-radius: 0.5em;
  padding: 5px;
  position: absolute;
  z-index: 1;
  bottom: calc(100% + 0.5em);
  left: 50%;
  margin-left: -3em;
  opacity: 0;
  transition: opacity 0.3s;
}

#copy_button .tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -0.5em;
  border-width: 0.5em;
  border-style: solid;
  border-color: #555555 transparent transparent transparent;
}

#copy_button:focus .tooltip {
  visibility: visible;
  opacity: 1;
}
`;
document.head.appendChild(style_sheet);

// browser.runtime.sendMessage({type         : "match_update",
//                              current_match: match,
//                              match_history: match_history})

var current_match = null
var match_history = []

//remove old elements in case extension is reloaded
var old_divs = document.getElementsByClassName("ranked_match_info")
while(old_divs.length > 0)
{
    old_divs[0].parentNode.removeChild(old_divs[0]);
}

var match_div = document.createElement("div");
match_div.className = "ranked_match_info";
document.getElementsByClassName("game_frame")[0].after(match_div);

var match_roster = document.createElement("div");
match_roster.className = "match_roster";
match_roster.innerHTML = "<h2>Ranked Lobby Monitor</h2><p style='margin-left: 2em;'>Match info should appear here at the end of the first round.</p>";
match_div.appendChild(match_roster);

var submit_div = document.createElement("div");
submit_div.className = "submit_code";
match_div.appendChild(submit_div);

var submit_text = document.createElement("div");
submit_text.id = "submit_text";
submit_text.innerText = "!submit";
submit_div.appendChild(submit_text);

function copy_submit_text()
{
    navigator.clipboard.writeText(submit_text.innerText);
}

var copy_button = document.createElement("button");
copy_button.id = "copy_button";
copy_button.innerHTML = '<span class="tooltip">Copied to Clipboard</span> Copy';
copy_button.onclick = copy_submit_text;
submit_div.appendChild(copy_button);

let port = browser.runtime.connect();

var discord_id_table = {};

let discord_ids_getter = browser.storage.local.get({"sap_discord_ids": discord_id_table});
function onGot(item) {
    discord_id_table = item["sap_discord_ids"];
    // console.log("got saved discord ids:");
    // console.log(JSON.stringify(item));
}
function onError(error) {
    console.log(`Error: ${error}`);
}
discord_ids_getter.then(onGot, onError);

function sort_players(players)
{
    let player_order = Object.keys(current_match.player_list);//.filter(function(p){return p.rank != null;});
    player_order.sort(function(a_DisplayName, b_DisplayName){
        let a = players[a_DisplayName];
        let b = players[b_DisplayName];
        let a_val = 0;
        let b_val = 0;
        if(a.Lives > 0) a_val += 1000*a.Lives;
        if(b.Lives > 0) b_val += 1000*b.Lives;
        if(a.rank != null) a_val -= a.rank;
        if(b.rank != null) b_val -= b.rank;
        return (b_val > a_val) ? +1 : ((b_val < a_val) ? -1 : 0);
    });
    return player_order;
}

function update_submission_code()
{
    // console.log("updating submission code");
    let players = current_match.player_list
    let player_order = sort_players(players);

    submission_code = "!submit";

    for(let DisplayName of player_order)
    {
        let p = players[DisplayName];
        submission_code += " ";
        if(DisplayName in discord_id_table) submission_code += discord_id_table[DisplayName];
        else submission_code += "<missing discord id for "+DisplayName+">"
        submission_code += " ";
        if(p.rank != null) submission_code += p.rank;
        else submission_code += "?"
    }

    submit_text.innerText = submission_code;
}

function handle_discord_id_update(e)
{
    let DisplayName = e.target.name;
    let discord_id  = e.target.value;

    discord_id_table[DisplayName] = discord_id;
    update_submission_code();

    // console.log("updating saved discord ids:");
    // console.log(discord_id_table);
    browser.storage.local.set({"sap_discord_ids": discord_id_table});
}

function update_team_list()
{
    match_roster.innerHTML = ""

    let header = document.createElement("h2");
    let title = "Turn " + current_match.CurrentTurn;
    if(current_match.MatchState == 2) title = "Game Over "+title;
    header.innerText = title;
    match_roster.appendChild(header);

    let form = document.createElement("form");
    let table = document.createElement("table");
    table.className = "teamlist";

    form.appendChild(table);
    match_roster.appendChild(form);

    current_round = current_match.rounds[current_match.rounds.length-1];
    let players = current_match.player_list;
    let player_order = sort_players(players);

    let row = document.createElement("tr");
    table.appendChild(row);
    row.innerHTML = "<th>Player</th><th>Discord @</th><th>Team Name</th><th>Lives</th><th>Turn Eliminated</th><th>Placement</th>";

    for(let DisplayName of player_order)
    {
        let row = document.createElement("tr")
        table.appendChild(row);

        let p = players[DisplayName];
        let display_name_element = document.createElement("td");
        display_name_element.innerText = DisplayName;
        row.appendChild(display_name_element);

        let discord_id_element = document.createElement("td");
        let input_element = document.createElement("input")
        input_element.type = "text";
        input_element.name = DisplayName;
        if(DisplayName in discord_id_table) input_element.value = discord_id_table[DisplayName];
        else input_element.value = "@";
        input_element.addEventListener("input", handle_discord_id_update);
        row.appendChild(discord_id_element);
        discord_id_element.appendChild(input_element);

        let board_name_element = document.createElement("td");
        board_name_element.innerText = p.BoardName;
        row.appendChild(board_name_element);

        let lives_element = document.createElement("td");
        lives_element.innerHTML = p.Lives+" &#10084";
        row.appendChild(lives_element);

        let turn_eliminated_element = document.createElement("td");
        if(p.turn_eliminated != null) turn_eliminated_element.innerHTML = p.turn_eliminated+" &#8987;";
        row.appendChild(turn_eliminated_element);

        let rank_element = document.createElement("td");
        if(p.rank != null) rank_element.innerText = p.rank;
        row.appendChild(rank_element);
    }
}

function update(message)
{
    if(message.type == "match_update")
    {
        current_match = message.current_match;
        match_history = message.match_history;
        update_team_list();
        update_submission_code();
    }
}

function update_discord_ids(changes, areaName)
{
    if(areaName == "local")
    {
        if("sap_discord_ids" in changes)
        {
            // console.log("saved discord ids changed:");
            discord_id_table = Object.assign(discord_id_table, changes["sap_discord_ids"].newValue);
        }
    }
}

browser.storage.onChanged.addListener(update_discord_ids);

port.onMessage.addListener(update);
