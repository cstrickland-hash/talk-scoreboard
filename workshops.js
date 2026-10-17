(function(){
var DAYS=["SUN","MON","TUE","WED","THU","FRI","SAT"],M=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function hst(){return new Date(Date.now()-10*3600e3).toISOString().slice(0,10);}
function t12(s){var h=+s.slice(11,13),m=s.slice(14,16),ap=h<12?"AM":"PM";h=h%12||12;return h+(m=="00"?"":":"+m)+" "+ap;}
function esc(s){return s.replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function draw(evs){var today=hst(),end=new Date(Date.parse(today+"T00:00:00Z")+14*864e5).toISOString().slice(0,10);
 var list=evs.filter(function(e){var d=e.start.slice(0,10);return d>=today&&d<=end;}).slice(0,9);
 var h="";if(!list.length||list[0].start.slice(0,10)!==today){var t=new Date(today+"T12:00:00Z");h+='<div class="wsr today"><div class="d">'+DAYS[t.getUTCDay()]+' '+M[t.getUTCMonth()]+' '+t.getUTCDate()+'</div><div class="i"><div class="n">No company events today</div><div class="w">Lead gen day. Next one below</div></div><span class="tag">TODAY</span></div>';}
 h+=list.map(function(e){var d=new Date(e.start.slice(0,10)+"T12:00:00Z"),isT=e.start.slice(0,10)===today;
  return '<div class="wsr'+(isT?' today':'')+'"><div class="d">'+DAYS[d.getUTCDay()]+' '+M[d.getUTCMonth()]+' '+d.getUTCDate()+'</div><div class="i"><div class="n">'+esc(e.title)+'</div><div class="w">'+t12(e.start)+'–'+t12(e.end)+' HST · '+esc(e.loc)+'</div></div>'+(isT?'<span class="tag">TODAY</span>':'')+'</div>';}).join("");
 document.getElementById("ws-list").innerHTML=h;}
function load(){fetch("data/company_calendar.json?t="+Date.now()).then(function(r){return r.json();}).then(function(j){draw(j.events);}).catch(function(){});}
load();setInterval(load,30*60e3);})();
