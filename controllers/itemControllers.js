import Item from "../models/item.js";

// Add Item
export const addItem = async (req, res) => {
    const userId = req.user.id;

    try {
        const {itemCode, name, description, pack, market, bottlesPerCase, brand, company} = req.body;
        
        // Validation: check for missing filelds
        if (!itemCode || !name || !description || !pack || !market || !bottlesPerCase || !brand || !company) {
            return res.status(400).send({ message: 'Send all required fileds'})
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
            createdBy: userId
        });

        return res.status(201).send(item);

    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
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

        const items = await Item.find(filter)
        return res.status(200).json({
            count: items.length,
            data: items
        });
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Get Item by ID
export const getItemByID = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await Item.findById(id);
        return res.status(200).json(item);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Update Item by ID
export const updateItemByID = async (req, res) => {
    try {
        const {itemCode, name, description, pack, bottlesPerCase, brand, company} = req.body;
        
        // Validation: check for missing filelds
        if (!itemCode || !name || !description || !pack || !bottlesPerCase || !brand || !company) {
            return res.status(400).send({ message: 'Send all required fileds'})
        }

        const { id } = req.params;
        const result = await Item.findByIdAndUpdate(id, req.body, { new: true });
        
        if (!result) {
            return res.status(404).json({message: "Item not found"});
        }

        return res.status(200).json(result);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}