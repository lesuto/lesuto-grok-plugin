const DROPPABLE = ['stillMode', 'productId', 'errorMessage'];

export function isGraphqlSchemaMismatch(err) {
  return /Cannot query field|is not defined by type|Unknown argument|Unknown field/i.test(String(err?.message || err || ''));
}

export function stripSceneContractFields(query) {
  let next = String(query || '');
  for (const field of DROPPABLE) {
    next = next.replace(new RegExp(`\\b${field}\\b`, 'g'), '');
  }
  return next.replace(/[ \t]{2,}/g, ' ');
}

export function inputSetsStillContract(input) {
  if (!input || typeof input !== 'object') return false;
  return input.stillMode !== undefined || input.productId !== undefined;
}

export async function graphqlWithSceneFieldTiers(send, query, variables, opts) {
  try {
    return await send(query, variables, opts);
  } catch (err) {
    if (!isGraphqlSchemaMismatch(err)) throw err;
    if (inputSetsStillContract(variables?.input)) {
      throw new Error('Still mode is not on this API yet. Deploy chameleon-admin, then set listing_orbit, lifestyle, establishing, or end_card.');
    }
    const stripped = stripSceneContractFields(query);
    if (stripped === query) throw err;
    return send(stripped, variables, opts);
  }
}
