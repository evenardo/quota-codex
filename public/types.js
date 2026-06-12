/**
 * @typedef {"labor" | "material"} QuoteItemType
 */

/**
 * @typedef {Object} LaborItem
 * @property {string} id
 * @property {string} name
 * @property {string} unit
 * @property {string} category
 * @property {string} categoryId
 * @property {string} description
 * @property {number} auxiliary
 * @property {number} labor
 * @property {number} costAuxiliary
 * @property {number} costLabor
 * @property {string} quantityFormula
 * @property {boolean} quantityRoundDown
 * @property {number} sortOrder
 * @property {string[]} aliases
 */

/**
 * @typedef {Object} MaterialKind
 * @property {string} id
 * @property {string} name
 * @property {string} libraryCategory
 * @property {string} primaryCategory
 * @property {string} unit
 * @property {number} costUnitPrice
 * @property {number} quoteUnitPrice
 * @property {number} unitPrice
 * @property {number} calcCostArea
 * @property {number} calcCostPrice
 * @property {number} calcQuoteArea
 * @property {number} calcQuotePrice
 * @property {number} sortOrder
 * @property {string} note
 */

/**
 * @typedef {Object} Material
 * @property {string} id
 * @property {string} name
 * @property {string} materialKindId
 * @property {string} primaryCategory
 * @property {string} category
 * @property {string} spec
 * @property {string} unit
 * @property {number} costUnitPrice
 * @property {number} quoteUnitPrice
 * @property {number} unitPrice
 * @property {number} calcCostArea
 * @property {number} calcCostPrice
 * @property {number} calcQuoteArea
 * @property {number} calcQuotePrice
 * @property {string} conversionUnit
 * @property {number} conversionQuantity
 * @property {string} brand
 * @property {string} supplier
 * @property {string} pricingFormula
 * @property {string} note
 * @property {number} sortOrder
 */

/**
 * @typedef {Object} ProjectGroup
 * @property {string} id
 * @property {string} name
 * @property {"space"} type
 * @property {"labor" | "material"} workType
 * @property {string} iconKey
 * @property {string} templateId
 * @property {number} area
 * @property {number} perimeter
 * @property {number} height
 * @property {number} buildingArea
 * @property {boolean} collapsed
 * @property {number} sortOrder
 */

/**
 * @typedef {Object} QuoteItem
 * @property {string} id
 * @property {string} engineeringName
 * @property {string} priceItemName
 * @property {QuoteItemType} sourceType
 * @property {string} area
 * @property {string} spaceId
 * @property {string} materialKindId
 * @property {string} materialId
 * @property {string} materialCategory
 * @property {number} quantity
 * @property {number} material
 * @property {number} auxiliary
 * @property {number} wasteRate
 * @property {number} labor
 * @property {number|null} legacyUnitPrice
 */

/**
 * @typedef {Object} Quote
 * @property {string} id
 * @property {string} customerId
 * @property {string} name
 * @property {string} projectName
 * @property {string} clientName
 * @property {string} clientPhone
 * @property {string} clientAddress
 * @property {string} quoteDate
 * @property {string} priceVersionId
 * @property {number} managementRate
 * @property {number} designRate
 * @property {number} taxRate
 * @property {boolean} showAmountColumns
 * @property {ProjectGroup[]} spaces
 * @property {QuoteItem[]} lines
 */

/**
 * @typedef {Object} QuoteTotals
 * @property {number} laborSubtotal
 * @property {number} materialSubtotal
 * @property {number} packageSubtotal
 * @property {number} subtotal
 * @property {number} management
 * @property {number} design
 * @property {number} tax
 * @property {number} grand
 */

export {};
