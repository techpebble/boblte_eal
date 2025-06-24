import Company from "../models/company.js";

// Add Company
export const addCompany = async (req, res) => {
    try {
        if (
            !req.body.name ||
            !req.body.code ||
            !req.body.address
        ) {
            return res.status(400).send({
                message: 'Send all required fileds'
            })
        }

        const company = await Company.create({
            name: req.body.name,
            code: req.body.code,
            address: req.body.address,
        });

        return res.status(201).send(company);

    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Get all Company
export const getAllCompany = async (req, res) => {
    try {
        const companies = await Company.find({});
        return res.status(200).json({
            count: companies.length,
            data: companies
        });
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Get Company by ID
export const getCompanyByID = async (req, res) => {
    try {
        const { id } = req.params;
        const company = await Company.findById(id);
        return res.status(200).json(company);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}

// Update Company by ID
export const updateCompanyByID = async (req, res) => {
    try {
        if (
            !req.body.name ||
            !req.body.code ||
            !req.body.address
        ) {
            return res.status(400).send({
                message: 'Send all required fileds'
            })
        }

        const { id } = req.params;
        const result = await Company.findByIdAndUpdate(id, req.body, { new: true });
        
        if (!result) {
            return res.status(404).json({message: "Book not found"});
        }

        return res.status(200).json(result);
    } catch (error) {
        console.log(error.message);
        res.status(500).send({message: error.message});
    }
}