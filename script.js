"use strict";
const API = "https://marcconrad.com/uob/tomato/api.php?out=json";
const $ = id => document.getElementById(id);
const DB = "tomato_users", SESSION = "tomato_session";
let user = null, score = 0, lives = 3, left = 20, timer = null, answer = null, playing = false;

/* ---------- storage helpers ---------- */
const getUsers = () => { try { return JSON.parse(localStorage.getItem(DB)) || {}; } catch { return {}; } };
const saveUsers = u => localStorage.setItem(DB, JSON.stringify(u));

/* ---------- virtual identity: salted SHA-256 + session cookie ---------- */
async function hash(pw, salt){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const setCookie = (n, v, days) => document.cookie = `${n}=${encodeURIComponent(v)};max-age=${days*86400};path=/;SameSite=Lax`;
const getCookie = n => (document.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"))||[])[1];

async function register(){
  const name = $("user").value.trim(), pw = $("pass").value;
  if(!/^\w{3,20}$/.test(name)) return authMsg("Username: 3-20 letters/numbers/_");
  if(pw.length < 6) return authMsg("Password must be at least 6 characters");
  const users = getUsers();
  if(users[name]) return authMsg("Username already taken");
  const salt = crypto.getRandomValues(new Uint32Array(2)).join("-");
  users[name] = { salt, hash: await hash(pw, salt), best: 0, created: Date.now() };
  saveUsers(users); authMsg("Registered! Logging in…", false); await login();
}
async function login(){
  const name = $("user").value.trim(), pw = $("pass").value, u = getUsers()[name];
  if(!u || await hash(pw, u.salt) !== u.hash) return authMsg("Wrong username or password");
  startSession(name);
}
function startSession(name){
  user = name; setCookie(SESSION, name, 7);
  $("auth").classList.add("hidden"); $("game").classList.remove("hidden");
  $("who").textContent = "👤 " + name + " (best " + getUsers()[name].best + ")";
  $("pass").value = ""; renderBoard();
}
function logout(){
  stop(); setCookie(SESSION, "", -1); user = null;
  $("game").classList.add("hidden"); $("auth").classList.remove("hidden"); authMsg("");
}
function authMsg(m, err = true){ const e = $("authMsg"); e.textContent = m; e.className = "msg" + (err ? " err" : ""); }

/* ---------- interoperability: Tomato API over HTTPS (JSON) ---------- */
async function loadPuzzle(){
  $("gameMsg").textContent = "Loading puzzle…";
  try{
    const r = await fetch(API + "&t=" + Date.now());
    if(!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();               // { question: <image url>, solution: <digit> }
    answer = Number(d.solution);
    $("puzzle").src = d.question;
    $("gameMsg").textContent = "What is the missing digit?";
    return true;
  }catch(e){
    $("gameMsg").textContent = "Could not reach the Tomato API (" + e.message + "). Check connection.";
    return false;
  }
}

/* ---------- game logic ---------- */
async function start(){
  stop(); score = 0; lives = 3; playing = true; updateHUD();
  if(await loadPuzzle()) tick(20);
}
function tick(sec){
  clearInterval(timer); left = sec; $("time").textContent = left;
  timer = setInterval(() => {                 // TIMER EVENT
    $("time").textContent = --left;
    if(left <= 0) wrong("Time's up!");
  }, 1000);
}
function stop(){ clearInterval(timer); playing = false; }
function updateHUD(){ $("score").textContent = score; $("lives").textContent = lives; }

async function guess(n){
  if(!playing) return;
  if(n === answer){
    score += 10 + left; updateHUD(); $("gameMsg").textContent = "✅ Correct!";
    if(await loadPuzzle()) tick(Math.max(8, 20 - Math.floor(score/100)));
  } else wrong("❌ Wrong! It was " + answer);
}
async function wrong(m){
  lives--; updateHUD(); $("gameMsg").textContent = m;
  if(lives <= 0) return gameOver();
  if(await loadPuzzle()) tick(20);
}
function gameOver(){
  stop(); const users = getUsers();
  if(score > users[user].best){ users[user].best = score; saveUsers(users); }
  $("who").textContent = "👤 " + user + " (best " + users[user].best + ")";
  $("gameMsg").textContent = "Game over! Final score: " + score; renderBoard();
}
function renderBoard(){
  const rows = Object.entries(getUsers()).sort((a,b) => b[1].best - a[1].best).slice(0,10);
  $("board").innerHTML = "";
  rows.forEach(([n,u],i) => { const tr = document.createElement("tr");
    [i+1, n, u.best].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
    $("board").appendChild(tr); });
}

/* ---------- event wiring (event-driven architecture) ---------- */
for(let i = 0; i <= 9; i++){
  const b = document.createElement("button"); b.textContent = i;
  b.addEventListener("click", () => guess(i));       // GUI click events
  $("digits").appendChild(b);
}
$("btnLogin").addEventListener("click", login);
$("btnReg").addEventListener("click", register);
$("btnLogout").addEventListener("click", logout);
$("btnStart").addEventListener("click", start);
$("btnHint").addEventListener("click", () => playing && wrong("Skipped"));
$("pass").addEventListener("keydown", e => { if(e.key === "Enter") login(); });
document.addEventListener("keydown", e => { if(/^[0-9]$/.test(e.key) && user) guess(Number(e.key)); }); // keyboard events
window.addEventListener("load", () => {            // page-load event: restore session from cookie
  const n = decodeURIComponent(getCookie(SESSION) || "");
  if(n && getUsers()[n]) startSession(n); else renderBoard();
});