'use strict';
const scriptUrl=document.currentScript?.src;
const target=scriptUrl?new URL('../dialvo-terminal.html#trenches',scriptUrl).href:new URL('./dialvo-terminal.html#trenches',location.href).href;
function enterTrenches(){location.assign(target)}
document.addEventListener('click',event=>{const control=event.target.closest('button,a');if(!control)return;event.preventDefault();event.stopImmediatePropagation();enterTrenches()},true);
document.querySelector('#login-form').addEventListener('submit',event=>{event.preventDefault();enterTrenches()});
document.querySelector('#login-form').noValidate=true;
