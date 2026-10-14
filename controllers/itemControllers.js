import Item from "../models/item.js";

// Add Item
export const addItem = async (req, res) => {
    const userId = req.user.id;

    try {
        const { itemCode, name, description, pack, market, bottlesPerCase, brand, company, isActive } = req.body;

        // Validation: check for missing fields
        if (!itemCode || !name || !description || !pack || !market || !bottlesPerCase || !brand || !company) {
            return res.status(400).send({ message: 'Send all required fields' })
        }

        const item = await Item.create({
            itemCode,
            name,
            description,
            pack,
            market,
            bottlesPerCase,
            brand,
            company,
            isActive: typeof isActive === 'boolean' ? isActive : true,
            createdBy: userId
        });

        return res.status(201).send(item);

    } catch (error) {
        console.log(error.message);
        res.status(500).send({ message: error.message });
    }
}

// Get all Items
export const getAllItem = async (req, res) => {
    try {
        const filter = {};

        // Optional query filters
        if (req.query.company) filter.company = req.query.company;
        if (req.query.market) filter.market = req.query.market;
        if (req.query.pack) filter.pack = req.query.pack;
        // Status filter: defaults to active items only unless specified otherwise
        if (req.query.isActive === 'all') {
            // Return all items (active and inactive)
        } else if (req.query.isActive === 'false') {
            filter.isActive = false;
        } else {
            // Default (when no param is provided, or isActive=true): active items only
            filter.isActive = { $ne: false };
        }

        const items = await Item.find(filter)
            .populate('company', 'name')
            .populate('pack', 'name bottlesPerCase');
        return res.status(200).json({
            count: items.length,
            data: items
        });
    } catch (error) {
        console.log(error.message);
        res.status(500).send({ message: error.message });
    }
}

// Get Item by ID
export const getItemByID = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await Item.findById(id)
            .populate('company', 'name')
            .populate('pack', 'name bottlesPerCase');
        return res.status(200).json(item);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({ message: error.message });
    }
}

// Update Item by ID
export const updateItemByID = async (req, res) => {
    try {
        const { itemCode, name, description, pack, bottlesPerCase, brand, company } = req.body;

        // Validation: check for missing fields
        if (!itemCode || !name || !description || !pack || !bottlesPerCase || !brand || !company) {
            return res.status(400).send({ message: 'Send all required fields' })
        }

        const { id } = req.params;
        const result = await Item.findByIdAndUpdate(id, req.body, { new: true })
            .populate('company', 'name')
            .populate('pack', 'name bottlesPerCase');

        if (!result) {
            return res.status(404).json({ message: "Item not found" });
        }

        return res.status(200).json(result);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({ message: error.message });
    }
}

// Update Item Status (Active / Inactive)
export const updateItemStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).send({ message: 'isActive boolean is required' });
        }

        const result = await Item.findByIdAndUpdate(
            id,
            { isActive },
            { new: true }
        )
            .populate('company', 'name')
            .populate('pack', 'name bottlesPerCase');

        if (!result) {
            return res.status(404).json({ message: "Item not found" });
        }

        return res.status(200).json(result);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({ message: error.message });
    }
}