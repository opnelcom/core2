'use strict';
const {verify}=require('../_shared/password');

function sessionMaxAge(config){
  const seconds=Number(config.sessionMaxAgeSeconds||60*60*24*30);
  return Number.isFinite(seconds)&&seconds>0?Math.trunc(seconds):60*60*24*30;
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const email=String(ctx.body.email||'').trim().toLowerCase();
  const password=String(ctx.body.password||'');
  const r=await ctx.broker('core_saas','query',{
    text:`SELECT user_id,email,password_hash,known_name,full_name,user_type,status
          FROM core_user
          WHERE email=$1`,
    values:[email]
  });
  if(!r.rowCount||r.rows[0].status!=='active'||!await verify(password,r.rows[0].password_hash)){
    return ctx.send(401,{error:'Invalid email or password'});
  }

  const u=r.rows[0];
  const maxAge=sessionMaxAge(ctx.config);
  const expiresAt=new Date(Date.now()+maxAge*1000).toISOString();
  ctx.setCookie('core_session',ctx.signSession({user_id:u.user_id,email:u.email,user_type:u.user_type},{maxAgeSeconds:maxAge}),{
    secure:ctx.config.cookieSecure===true,
    maxAge
  });

  const t=await ctx.broker('core_saas','query',{
    text:`SELECT t.tenant_id
          FROM core_tenant t
          JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
          WHERE lower(tu.email)=lower($1) AND tu.status='active' AND t.status='active'
          ORDER BY (t.tenant_type='personal_tenant') DESC,t.created_at
          LIMIT 1`,
    values:[u.email]
  });
  if(t.rowCount){
    ctx.setCookie('current_tenant',t.rows[0].tenant_id,{
      secure:ctx.config.cookieSecure===true,
      maxAge
    });
  }

  return {
    user:{user_id:u.user_id,email:u.email,known_name:u.known_name,full_name:u.full_name,user_type:u.user_type},
    session:{max_age_seconds:maxAge,expires_at:expiresAt}
  };
};
