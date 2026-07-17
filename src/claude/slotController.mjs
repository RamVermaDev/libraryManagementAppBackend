
import { createSlotForLibrary, getSlotsForLibrary, setSlotActiveStatus } from "./slotService.mjs";

/**
 * POST /libraries/:libraryId/slots
 * Body: { name, startMinute, endMinute, monthlyPrice }
 */
async function createSlot(req, res) {
    try {
        const { libraryId } = req.params;
        const slot = await createSlotForLibrary(libraryId, req.body);

        res.status(201).json({
            message: "Slot created successfully",
            slot
        });
    } catch (err) {
        console.log('Hello');
        res.status(400).json({ error: err.message });
    }
}

/**
 * GET /libraries/:libraryId/slots?activeOnly=true
 */
async function listSlots(req, res) {
    try {
        const { libraryId } = req.params;
        const activeOnly = req.query.activeOnly !== "false"; // default true

        const slots = await getSlotsForLibrary(libraryId, activeOnly);
        res.status(200).json({ count: slots.length, slots });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

/**
 * PATCH /slots/:slotTemplateId/status
 * Body: { isActive: false }
 */
async function updateSlotStatus(req, res) {
    try {
        const { slotTemplateId } = req.params;
        const { isActive } = req.body;

        const slot = await setSlotActiveStatus(slotTemplateId, isActive);
        if (!slot) return res.status(404).json({ error: "Slot not found" });

        res.status(200).json({ message: "Slot status updated", slot });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

export { createSlot, listSlots, updateSlotStatus };
