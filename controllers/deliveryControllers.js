import Delivery from "../models/delivery.js";

// Add Company
export const addDelivery = async (req, res) => {
    try {
        if (
            !req.body.name ||
            !req.body.code ||
            !req.body.address
        ) {
            return res.status(400).send({
                message: 'Send all required fields'
            })
        }

        const delivery = await Delivery.create({
            name: req.body.name,
            code: req.body.code,
            address: req.body.address,
        });

        return res.status(201).send(delivery);

    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Get all Company
export const getAllDelivery = async (req, res) => {
    try {
        const deliveries = await Delivery.find({});
        return res.status(200).json({
            count: deliveries.length,
            data: deliveries
        });
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Get Delivery by ID
export const getDeliveryByID = async (req, res) => {
    try {
        const { id } = req.params;
        const delivery = await Delivery.findById(id);
        return res.status(200).json(delivery);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Update Delivery by ID
export const updateDeliveryByID = async (req, res) => {
    try {
        if (
            !req.body.name ||
            !req.body.code ||
            !req.body.address
        ) {
            return res.status(400).send({
                message: 'Send all required fields'
            })
        }

        const { id } = req.params;
        const result = await Delivery.findByIdAndUpdate(id, req.body, { new: true });
        
        if (!result) {
            return res.status(404).json({message: "Delivery depot not found"});
        }

        return res.status(200).json(result);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}