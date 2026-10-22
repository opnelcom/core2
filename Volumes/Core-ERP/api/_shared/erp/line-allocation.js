'use strict';

// Object types are alternatives. Requirement and value behaviour belong to the line.
function objectAllocationError(definition, permitted, selected, subledgerId) {
  if (selected.length > 1) return 'can select at most one accounting object';
  if (selected.length && subledgerId) return 'cannot combine a sub-ledger and accounting object';
  const requirement = definition.object_requirement || 'not_used';
  if (requirement === 'mandatory' && !selected.length) return 'requires one accounting object';
  if (selected.length && requirement === 'not_used') return 'does not use an accounting object';
  if (selected.some(row => !permitted.some(type => type.accounting_object_type_id === row.type_id))) return 'uses an unconfigured accounting object type';
  if (selected.length && definition.object_value_behaviour === 'fixed' && selected[0].value_id !== definition.default_accounting_object_id) return 'must use its fixed accounting object';
  return null;
}

function objectDefinitionError(line) {
  const requirement = line.object_requirement || 'not_used';
  const behaviour = line.object_value_behaviour || 'captured';
  const types = line.object_requirements || [];
  if (!['not_used', 'optional', 'mandatory'].includes(requirement)) return 'has an invalid accounting object requirement';
  if (!['captured', 'defaulted', 'fixed'].includes(behaviour)) return 'has an invalid accounting object value behaviour';
  if ((requirement === 'not_used') !== (types.length === 0)) return 'must select permitted object types only when object allocation is used';
  if (requirement !== 'not_used' && line.subledger_requirement !== 'not_used') return 'cannot configure both sub-ledger and accounting object allocation';
  if ((behaviour === 'captured') !== !line.default_accounting_object_id) return 'must provide one object for defaulted or fixed allocation only';
  if (requirement === 'not_used' && behaviour !== 'captured') return 'cannot default an unused object allocation';
  if (new Set(types.map(row => row.type_id)).size !== types.length || types.some(row => !row.type_id)) return 'requires distinct permitted object types';
  return null;
}

module.exports = {objectAllocationError, objectDefinitionError};
