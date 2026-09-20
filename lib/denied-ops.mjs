export const DENIED_PREFIXES = [
  'crmagent', 'consultantcommand', 'sendevolution', 'aievolution', 'aiselfassessment',
  'aigaps', 'aiagentperformance', 'aievolutionreadiness', 'aievolutionmessages',
  'registerome', 'deregisterome', 'disablemfa', 'tenantapi', 'issuetenant',
  'updatetenantapi', 'inbound', 'importplatform', 'wipealloutreach',
  'createplatformbroadcast', 'login', 'adminlogin', 'verifymfa', 'requestemailmfa',
  'enrollmfa', 'confirmmfa', 'deletemyadministrator', 'exportmyadministrator',
  'issueagentaccess', 'revokeagentaccess', 'rotateagentaccess', 'agentaccesskeys',
  'agentaccessevent', 'agentaccessusage', 'agenteligiblestore',
  'listleads', 'createlead', 'updatelead', 'deletelead', 'bulkdeleteleads', 'importleads',
  'importoutreach', 'outreach', 'sendcampaign', 'createcampaign', 'schedulecampaign',
  'pausecampaign', 'resumecampaign', 'listcampaigns', 'getcampaign', 'farming',
  'discovercompan', 'smartdiscover', 'postmaster', 'kwbulk', 'kwsync', 'testkw',
  'takeoutreach', 'leadactivity', 'hotprospects', 'crmdashboard', 'crmforpage',
  'forpage', 'bulkdeleteforpage', 'restoreforpage', 'deploymentmeetings',
  'updatecrmconfig', 'updatecrmagent',
  'agentusagetoday', 'wipeall', 'connectpostmaster', 'suggestcompan',
  'suggestindustr', 'suggestmedia', 'queuedbrands', 'brandqueue', 'processqueued',
  'consultant',
];

export const DESTRUCTIVE_GRAPHQL_PREFIXES = [
  'cancelorder', 'refund', 'settlepayment', 'deleteproduct', 'deletechannel',
  'deleteadministrator', 'deletecustomer', 'deleteasset', 'deletecollection',
];

export function deniedOp(name) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return DENIED_PREFIXES.some((p) => n === p || n.startsWith(p));
}

export function isDestructiveGraphql(query) {
  const trimmed = String(query || '').trim().toLowerCase();
  if (!trimmed.startsWith('mutation')) return false;
  const fields = extractFields(query);
  return fields.some((f) => {
    const n = f.toLowerCase().replace(/[^a-z0-9]/g, '');
    return DESTRUCTIVE_GRAPHQL_PREFIXES.some((p) => n === p || n.startsWith(p));
  });
}

export function extractFields(query) {
  const fields = [];
  const re = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|\{)/g;
  let m;
  while ((m = re.exec(query || ''))) {
    const name = m[1];
    if (['query', 'mutation', 'subscription', 'fragment', 'on'].includes(name)) continue;
    fields.push(name);
  }
  return fields;
}

export function requireConfirm(args, label) {
  if (args?.confirm === true) return;
  throw new Error(`This ${label} is destructive. Call again with confirm: true after the merchant agrees.`);
}
