import Item from "../models/item.js";
import { companyScope, companyRefusal } from "../middleware/authMiddleware.js";

// Add Item
export const addItem = async (req, res) => {
    const userId = req.user.id;

    try {
        const { itemCode, name, alias, description, pack, market, bottlesPerCase, brand, company, isActive } = req.body;

        // Validation: check for missing fields
        if (!itemCode || !name || !description || !pack || !market || !bottlesPerCase || !brand || !company) {
            return res.status(400).send({ message: 'Send all required fields' })
        }

        // Every table, picker and the mobile app leads with the short name, so
        // an item without one would show a blank where its name should be.
        if (!alias || !String(alias).trim()) {
            return res.status(400).send({ message: 'A short name (alias) is required' })
        }

        const refusal = companyRefusal(req, company);
        if (refusal) {
            return res.status(403).json({ message: refusal });
        }

        const item = await Item.create({
            itemCode,
            name,
            alias,
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

        // Without companies:all a person sees only their own company, whatever
        // the query asked for.
        Object.assign(filter, companyScope(req));

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
        const item = await Item.findOne({ _id: id, ...companyScope(req) })
            .populate('company', 'name')
            .populate('pack', 'name bottlesPerCase');

        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

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

        // The scope on the query keeps someone out of another company's item;
        // this keeps them from pushing one of their own across into it.
        const refusal = companyRefusal(req, company);
        if (refusal) {
            return res.status(403).json({ message: refusal });
        }

        const { id } = req.params;
        const result = await Item.findOneAndUpdate({ _id: id, ...companyScope(req) }, req.body, { new: true })
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

        const result = await Item.findOneAndUpdate(
            { _id: id, ...companyScope(req) },
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