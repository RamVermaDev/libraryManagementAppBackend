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
 * Enable/disable a slot template. If isActive is provided, it's set
 * explicitly (matches PATCH .../status body). If omitted, it toggles
 * the current value instead.
 */
async function setSlotActiveStatus(slotTemplateId, isActive) {
    const slot = await slotTemplateModel.findById(slotTemplateId);

    if (!slot) {
        throw new Error("Slot not found");
    }

    slot.isActive = typeof isActive === "boolean" ? isActive : !slot.isActive;

    await slot.save();

    return slot;
}

/**
 * Edit an existing slot template.
 *
 * @param {String} slotTemplateId
 * @param {Object} data
 * { name, startMinute, endMinute, monthlyPrice }
 */
async function editSlotForLibrary(slotTemplateId, data) {
    const { name, startMinute, endMinute, monthlyPrice } = data;

    if (startMinute === undefined || endMinute === undefined) {
        throw new Error("startMinute and endMinute are required");
    }

    if (endMinute <= startMinute) {
        throw new Error("endMinute must be greater than startMinute");
    }

    if (monthlyPrice === undefined || monthlyPrice < 0) {
        throw new Error("monthlyPrice must be a positive number");
    }

    const slot = await slotTemplateModel.findByIdAndUpdate(
        slotTemplateId,
        {
            name,
            startMinute,
            endMinute,
            monthlyPrice,
        },
        {
            returnDocument: "after",
            runValidators: true,
        }
    );

    if (!slot) {
        throw new Error("Slot not found");
    }

    return slot;
}

/**
 * Delete a slot template.
 *
 * @param {String} slotTemplateId
 */
async function deleteSlotForLibrary(slotTemplateId) {
    const slot = await slotTemplateModel.findByIdAndDelete(slotTemplateId);

    if (!slot) {
        throw new Error("Slot not found");
    }

    return slot;
}

export { createSlotForLibrary, getSlotsForLibrary, setSlotActiveStatus, editSlotForLibrary, deleteSlotForLibrary };
