import Company from "../models/company.js";

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