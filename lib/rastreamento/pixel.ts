/**
 * Gera o script do pixel (track.js) servido em /track.js.
 *
 * Instalação na LP/loja do cliente:
 *   <script src="https://SEU_APP/track.js" data-company="PUBLIC_TOKEN" async defer></script>
 *
 * O que faz:
 *   1. Grava cookies first-party (ta_tid, ta_attr) por 90 dias e captura
 *      UTM/fbclid/gclid/_fbp da URL e do navegador.
 *   2. Reporta o PageView para /api/rastreamento/lead-origin e recebe o tracking_id.
 *   3. Carimba ` [@<código>]` nos links wa.me com ?text=, para o webhook do
 *      WhatsApp reencontrar a visita e colar a campanha no lead.
 *   4. Expõe window.TrackerPixel.purchase({...}) para a página de obrigado.
 */
export function gerarPixelJs(apiBase: string): string {
  const base = JSON.stringify(apiBase.replace(/\/$/, ''))
  return `(function(){"use strict";
var API=${base};
var s=document.currentScript;if(!s)return;
var COMPANY=(s.getAttribute("data-company")||"").trim();
var LINK=(s.getAttribute("data-link")||"").trim();
if(!COMPANY)return;
var LEAD_EP=API+"/api/rastreamento/lead-origin";
var BUY_EP=API+"/api/rastreamento/purchase";
var TID="ta_tid",ATTR="ta_attr",DAYS=90;
function gc(n){var m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?decodeURIComponent(m[2]):null;}
function sc(n,v,d){var e=new Date(Date.now()+d*864e5).toUTCString();document.cookie=n+"="+encodeURIComponent(v)+"; expires="+e+"; path=/; SameSite=Lax";}
function gp(p){return new URLSearchParams(location.search).get(p)||"";}
function ra(){try{var r=gc(ATTR);return r?JSON.parse(r):{};}catch(e){return{};}}
function wa(o){try{sc(ATTR,JSON.stringify(o),DAYS);}catch(e){}}
function merge(st){var o=Object.assign({},st),k=["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid","gclid","gbraid","wbraid","ta_cod"],ch=false;
for(var i=0;i<k.length;i++){var v=gp(k[i]);if(v){o[k[i]]=v;ch=true;}}
if(LINK&&!o.link_id){o.link_id=LINK;ch=true;}
if(document.referrer&&!o.referrer)o.referrer=document.referrer;
if(ch)wa(o);return o;}
function fbp(){return gc("_fbp")||null;}
function attribution(){var a=merge(ra());return{tracking_id:gc(TID)||null,link_id:a.link_id||LINK||null,
utm_source:a.utm_source||"",utm_medium:a.utm_medium||"",utm_campaign:a.utm_campaign||"",utm_content:a.utm_content||"",utm_term:a.utm_term||"",
fbclid:a.fbclid||"",gclid:a.gclid||"",gbraid:a.gbraid||"",wbraid:a.wbraid||"",ta_cod:a.ta_cod||"",fbp:fbp(),
referrer:a.referrer||document.referrer||"",page_url:location.href};}
function send(){var a=attribution();var p={company_token:COMPANY,page_url:a.page_url};
["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid","gclid","gbraid","wbraid","ta_cod","fbp","referrer"].forEach(function(k){if(a[k])p[k]=a[k];});
if(a.tracking_id)p.tracking_id=a.tracking_id;if(a.link_id)p.link_id=a.link_id;
fetch(LEAD_EP,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p),keepalive:true})
.then(function(r){return r.json();}).then(function(d){if(d&&d.tracking_id){sc(TID,d.tracking_id,DAYS);sweep();}}).catch(function(){});}
var WA=/^(www\\.)?(wa\\.me|api\\.whatsapp\\.com|web\\.whatsapp\\.com)$/i,MARK=/\\[@[A-Za-z0-9]{6,16}\\]/;
function code(){var t=gc(TID);if(!t)return null;var h=String(t).replace(/-/g,"").toLowerCase();return h.length>=8?h.slice(0,8):null;}
function deco(href,c){if(!href)return null;var u;try{u=new URL(href,location.href);}catch(e){return null;}
if(!WA.test(u.hostname))return null;var tx=u.searchParams.get("text");if(!tx)return null;if(MARK.test(tx))return null;
var mk=encodeURIComponent(" [@"+c+"]");var nx=href.replace(/([?&]text=)([^&#]*)/,function(_m,p,v){return p+v+mk;});return nx===href?null:nx;}
function decoA(a){if(!a||!a.getAttribute)return;var c=code();if(!c)return;var nx=deco(a.getAttribute("href"),c);if(nx)a.setAttribute("href",nx);}
function onDown(e){try{var t=e&&e.target;if(!t||!t.closest)return;decoA(t.closest("a[href]"));}catch(x){}}
function sweep(){try{if(!code())return;var n=document.querySelectorAll('a[href*="wa.me"],a[href*="whatsapp.com"]');for(var i=0;i<n.length;i++)decoA(n[i]);}catch(x){}}
document.addEventListener("click",onDown,true);document.addEventListener("auxclick",onDown,true);
document.addEventListener("touchstart",onDown,true);document.addEventListener("contextmenu",onDown,true);
function purchase(o){o=o||{};var a=attribution();var em=(o.email||"").trim(),ph=(o.phone||"").trim();
if(!em&&!ph){return Promise.resolve({ok:false,error:"phone_or_email_required"});}
var b={company_token:COMPANY,order_id:o.order_id,event_id:o.event_id,value:typeof o.value==="number"?o.value:undefined,
currency:o.currency||"BRL",product_name:o.product_name,name:o.name,email:em||undefined,phone:ph||undefined,
tracking_id:a.tracking_id||undefined,fbclid:a.fbclid||undefined,fbp:a.fbp||undefined,
utm_source:a.utm_source||undefined,utm_campaign:a.utm_campaign||undefined};
return fetch(BUY_EP,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),keepalive:true})
.then(function(r){return r.json();}).catch(function(){return{ok:false};});}
var api={getAttribution:attribution,purchase:purchase};
window.TrackerPixel=api;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){send();sweep();});else{send();sweep();}
})();`
}
