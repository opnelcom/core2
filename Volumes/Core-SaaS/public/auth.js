(()=>{
const $=id=>document.getElementById(id);
const rememberedKey='coreSaasRememberedDevice';

async function api(path,options={}){
  const r=await fetch('/api/'+path,{headers:{'content-type':'application/json'},...options});
  const j=await r.json();
  if(!r.ok)throw new Error(j.error||'Request failed');
  return j;
}

function showPanel(panelId){
  document.querySelectorAll('.tab-button').forEach(button=>{
    button.classList.toggle('active',button.dataset.panel===panelId);
  });
  document.querySelectorAll('.auth-panel').forEach(panel=>{
    panel.classList.toggle('active',panel.id===panelId);
  });
}

function msg(x,type='error'){
  const message=$('message');
  message.textContent=typeof x==='string'?x:JSON.stringify(x,null,2);
  message.classList.toggle('success',type==='success');
}

function clearMsg(){
  $('message').textContent='';
  $('message').classList.remove('success');
}

function deviceId(){
  const existing=localStorage.getItem('coreSaasDeviceId');
  if(existing)return existing;
  const id=(window.crypto&&window.crypto.randomUUID)?window.crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(16).slice(2);
  localStorage.setItem('coreSaasDeviceId',id);
  return id;
}

function rememberLogin(user,session){
  localStorage.setItem(rememberedKey,JSON.stringify({
    device_id:deviceId(),
    email:user.email,
    known_name:user.known_name||'',
    full_name:user.full_name||'',
    user_type:user.user_type,
    user_agent:navigator.userAgent,
    platform:navigator.platform||'',
    language:navigator.language||'',
    last_login_at:new Date().toISOString(),
    session_expires_at:session&&session.expires_at
  }));
}

function prefillRememberedEmail(){
  try{
    const remembered=JSON.parse(localStorage.getItem(rememberedKey)||'null');
    if(remembered&&remembered.email&&!$('l-email').value)$('l-email').value=remembered.email;
  }catch{}
}

function writeResult(id,data){
  $(id).textContent=typeof data==='string'?data:JSON.stringify(data,null,2);
}

async function registerUser(){
  clearMsg();
  try{
    const j=await api('auth/register',{
      method:'POST',
      body:JSON.stringify({
        email:$('r-email').value,
        password:$('r-password').value,
        known_name:$('r-known-name').value,
        full_name:$('r-full-name').value
      })
    });
    writeResult('register-result',j);
    msg(j.message||'Registration created. Check your email to activate your account.','success');
  }catch(e){msg(e.message)}
}

async function activate(){
  clearMsg();
  try{
    const j=await api('auth/activate',{method:'POST',body:JSON.stringify({token:$('token').value})});
    writeResult('activate-result',j);
    msg(j.message||'Account activated. You can now sign in.','success');
    showPanel('login-panel');
  }catch(e){msg(e.message)}
}

async function resendActivation(){
  clearMsg();
  try{
    const j=await api('auth/resendactivation',{method:'POST',body:JSON.stringify({email:$('a-email').value})});
    $('resend-result').textContent=j.message||'If the account is pending, an activation message has been sent.';
    msg(j.message||'If the account is pending, an activation message has been sent.','success');
  }catch(e){msg(e.message)}
}

async function login(){
  clearMsg();
  try{
    const j=await api('auth/login',{method:'POST',body:JSON.stringify({email:$('l-email').value,password:$('l-password').value})});
    rememberLogin(j.user,j.session);
    location.href='/landing.html';
  }catch(e){msg(e.message)}
}

async function sendReset(){
  clearMsg();
  try{
    const j=await api('auth/forgotpassword',{method:'POST',body:JSON.stringify({email:$('f-email').value})});
    $('forgot-result').textContent=j.message||'If the account exists, a password reset message has been sent.';
    msg(j.message||'If the account exists, a password reset message has been sent.','success');
  }catch(e){msg(e.message)}
}

async function resetPassword(){
  clearMsg();
  try{
    const j=await api('auth/resetpassword',{method:'POST',body:JSON.stringify({token:$('reset-token').value,password:$('new-password').value})});
    $('reset-result').textContent=j.message||'Password reset complete. You can now sign in.';
    $('new-password').value='';
    msg(j.message||'Password reset complete. You can now sign in.','success');
    showPanel('login-panel');
  }catch(e){msg(e.message)}
}

function bindClick(id,handler){
  const el=$(id);
  if(el)el.addEventListener('click',handler);
}

document.querySelectorAll('[data-panel]').forEach(button=>{
  button.addEventListener('click',()=>showPanel(button.dataset.panel));
});

bindClick('login-submit',login);
bindClick('register-submit',registerUser);
bindClick('activate-submit',activate);
bindClick('resend-activation-submit',resendActivation);
bindClick('forgot-submit',sendReset);
bindClick('set-password-submit',resetPassword);

const q=new URLSearchParams(location.search);
if(q.get('token')){
  $('token').value=q.get('token');
  showPanel('activate-panel');
}else if(q.get('resetToken')){
  $('reset-token').value=q.get('resetToken');
  showPanel('set-password-panel');
}else if(q.get('panel')==='forgot'){
  showPanel('forgot-panel');
}else if(q.get('panel')==='set-password'){
  showPanel('set-password-panel');
}else{
  prefillRememberedEmail();
  api('user/me').then(()=>{location.href='/landing.html'}).catch(()=>{});
}

Object.assign(window,{registerUser,activate,resendActivation,login,sendReset,resetPassword});
})();
