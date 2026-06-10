/**
 * @typedef {Object} PortableState
 * @property {"quote-tool"} app
 * @property {number} version
 * @property {string} exportedAt
 * @property {Record<string, unknown>} data
 */

/**
 * @typedef {Object} SqliteMaterial
 * @property {string} id
 * @property {number} sortOrder
 * @property {string} name
 * @property {string} materialKindId
 * @property {string} primaryCategory
 * @property {string} unit
 * @property {number} costUnitPrice
 * @property {number} quoteUnitPrice
 * @property {number} calcCostArea
 * @property {number} calcCostPrice
 * @property {number} calcQuoteArea
 * @property {number} calcQuotePrice
 */

/**
 * @typedef {Object} SqliteMaterialKind
 * @property {string} id
 * @property {number} sortOrder
 * @property {string} name
 * @property {string} libraryCategory
 * @property {string} primaryCategory
 * @property {string} unit
 * @property {number} costUnitPrice
 * @property {number} quoteUnitPrice
 * @property {number} calcCostArea
 * @property {number} calcCostPrice
 * @property {number} calcQuoteArea
 * @property {number} calcQuotePrice
 * @property {string} note
 */

export {};
