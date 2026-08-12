import Joi from "joi";


// La app manda tambien name/fullName al crear cuenta. El backend solo usa
// email y password, pero rechazar el registro entero por un campo extra
// dejaba a la gente sin poder crear cuenta ("name" is not allowed).
const validationSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    name: Joi.string().max(120).allow('', null),
    fullName: Joi.string().max(160).allow('', null),
  });
  
const validateForms = async (req, res, next) => {
    const { error } = validationSchema.validate(req.body);
  
    if (error) {
      const errorMessage = error.details[0].message;
      return res.status(400).json({ message: errorMessage });
    }
    next();
  }

module.exports = validateForms;