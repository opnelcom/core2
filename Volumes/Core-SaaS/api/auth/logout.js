module.exports=async ctx=>{ctx.clearCookie('core_session');ctx.clearCookie('current_tenant');return {message:'Logged out'};};
