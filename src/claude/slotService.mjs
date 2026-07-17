import { slotTemplateModel } from "./SlotTemplateModel.mjs";


/**
 * Create a slot template for a library, with its monthly price,
 * in a single call (name + time window + price all together).
 *
 * @param {String} libraryId
 * @param {Object} data  { name, startMinute, endMinute, monthlyPrice }
 */
async function createSlotForLibrary(libraryId, data) {
    const { name, startMinute, endMinute, monthlyPrice } = data;

    if (startMinute === undefined || endMinute === undefined) {
        throw new Error("startMinute and endMinute are required");
    }
    if (endMinute <= startMinute) {
        throw new Error("endMinute must be greater than startMinute");
    }
    if (!monthlyPrice || monthlyPrice < 0) {
        throw new Error("monthlyPrice must be a positive number");
    }

    const slot = await slotTemplateModel.create({
        libraryId,
        name,
        startMinute,
        endMinute,
        monthlyPrice
    });

    return slot;
}

/**
 * List all slot templates for a library (optionally only active ones).
 */
async function getSlotsForLibrary(libraryId, activeOnly = true) {
    const filter = { libraryId };
    if (activeOnly) filter.isActive = true;

    return slotTemplateModel.find(filter).sort({ startMinute: 1 }).lean();
}

/**
 * Enable/disable a slot template (e.g. owner temporarily stops offering it).
 */
async function setSlotActiveStatus(slotTemplateId, isActive) {
    return slotTemplateModel.findByIdAndUpdate(
        slotTemplateId,
        { isActive },
        { new: true }
    );
}

export { createSlotForLibrary, getSlotsForLibrary, setSlotActiveStatus };
