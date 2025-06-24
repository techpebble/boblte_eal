import Pack from "../models/pack.js";

// Add Pack
export const addPack = async (req, res) => {
    try {
        if (
            !req.body.name ||
            !req.body.bottlesPerCase ||
            !req.body.pack
        ) {
            return res.status(400).send({
                message: 'Send all required fileds'
            })
        }

        const pack = await Pack.create({
            name: req.body.name,
            bottlesPerCase: req.body.bottlesPerCase,
            pack: req.body.pack,
        });

        return res.status(201).send(pack);

    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Get all Pack
export const getAllPack = async (req, res) => {
    try {
        const packs = await Pack.find({}).sort({ pack: -1 });
        return res.status(200).json({
            count: packs.length,
            data: packs
        });
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Get Pack by ID
export const getPackByID = async (req, res) => {
    try {
        const { id } = req.params;
        const pack = await Pack.findById(id);
        return res.status(200).json(pack);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Update Pack by ID
export const updatePackByID = async (req, res) => {
    try {
        if (
            !req.body.name ||
            !req.body.bottlesPerCase ||
            !req.body.pack
        ) {
            return res.status(400).send({
                message: 'Send all required fileds'
            })
        }

        const { id } = req.params;
        const result = await Pack.findByIdAndUpdate(id, req.body, { new: true });
        
        if (!result) {
            return res.status(404).json({message: "Pack not found"});
        }

        return res.status(200).json(result);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}