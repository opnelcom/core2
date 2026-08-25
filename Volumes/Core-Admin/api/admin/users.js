'use strict';
const {requireAdmin,clean,hashPassword,userTypes,userStatuses}=require('../_shared/admin');

module.exports=async ctx=>{
  const admin=requireAdmin(ctx);
  if(admin.status)return ctx.send(admin.status,admin.body);
  if(ctx.req.method==='GET'){
    const r=await ctx.broker('core_saas','query',{text:`SELECT user_id,email,known_name,full_name,user_type,status,created_at,activated_at,updated_at FROM core_user ORDER BY created_at DESC`});
    return {users:r.rows};
  }
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'GET, POST or PATCH required'});
  const id=ctx.body.user_id||null;
  const email=clean(ctx.body.email)?.toLowerCase();
  const knownName=clean(ctx.body.known_name);
  const fullName=clean(ctx.body.full_name);
  const userType=ctx.body.user_type||'standard_user';
  const status=ctx.body.status||'active';
  const password=String(ctx.body.password||'');
  if(!email||!email.includes('@'))return ctx.send(400,{error:'Valid email required'});
  if(!userTypes.includes(userType))return ctx.send(400,{error:'Invalid user type'});
  if(!userStatuses.includes(status))return ctx.send(400,{error:'Invalid user status'});
  if(!id&&password.length<8)return ctx.send(400,{error:'Password of at least 8 characters required for new users'});
  const passwordHash=password?await hashPassword(password):null;
  const r=await ctx.broker('core_saas','query',{
    text:`INSERT INTO core_user(user_id,email,password_hash,known_name,full_name,user_type,status,activated_at)
          VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,COALESCE($3,(SELECT password_hash FROM core_user WHERE user_id=$1::uuid)),$4,$5,$6,$7,CASE WHEN $7='active' THEN now() ELSE NULL END)
          ON CONFLICT(user_id) DO UPDATE
          SET email=excluded.email,password_hash=COALESCE($3,core_user.password_hash),known_name=excluded.known_name,full_name=excluded.full_name,user_type=excluded.user_type,status=excluded.status,updated_at=now(),activated_at=CASE WHEN excluded.status='active' AND core_user.activated_at IS NULL THEN now() ELSE core_user.activated_at END
          RETURNING user_id,email,known_name,full_name,user_type,status,created_at,activated_at,updated_at`,
    values:[id,email,passwordHash,knownName,fullName,userType,status]
  });
  return {user:r.rows[0]};
};
