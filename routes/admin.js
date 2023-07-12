var express = require('express');
var router = express.Router();
const { PrismaClient } = require("@prisma/client")
const session = require('express-session');
var prisma = new PrismaClient();
const Joi = require('joi');
const validator = require('validator');
const bcrypt = require('bcrypt');

// Define the validation schema using Joi
const managerSchema = Joi.object({
  firstName: Joi.string().required(),
  middleName: Joi.string().allow(''),
  lastName: Joi.string().required(),
  contact: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// Add session middleware
router.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

function validateSession(req, res, next) {
  if (req.session.adminId) {
    // User is logged in
    next();
  } else {
    // User is not logged in, redirect to login page
    res.redirect('/login');
  }
}






/* GET admin dashboard */
router.get('/admin/dashboard', async function(req, res, next) {
  try {
    const managers = await prisma.manager.findMany();
    const transactions = await prisma.pet.count(); // Count the total number of pets
    const managerstrans = await prisma.manager.findMany({
      include: {
        pets: true
      }
    });
    const transactionsman = managerstrans.reduce((total, manager) => total + manager.pets.length, 0);

    
    
    const servicesPerBreed = await prisma.pet.groupBy({
      by: ['breed'],
      _count: {
        service: true
      }
    });  


    const averageAgePerBreed = await prisma.pet.groupBy({
      by: ['breed'],
      _avg: {
        age: true
      }
    });
    // Sort averageAgePerBreed array in descending order based on average age
    averageAgePerBreed.sort((a, b) => b._avg.age - a._avg.age);


    const maleCount = await prisma.pet.count({
      where: {
        gender: 'male'
      }
    });

    const femaleCount = await prisma.pet.count({
      where: {
        gender: 'female'
      }
    });

  
    const pets = await prisma.pet.findMany();
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ];
    
    const months = monthNames.slice(); // Create a copy of monthNames array
    const petsByMonth = {};
    pets.forEach(pet => {
      const monthName = getMonthName(pet.createdAt.getMonth()); // Extract the month name
      petsByMonth[monthName] = (petsByMonth[monthName] || 0) + 1; // Increment the count for the month
    });
    
    // Prepare the data for the line chart
    const totalPetsByMonth = months.map(month => petsByMonth[month] || 0); // Assign a count of 0 for months without data


  
    const weightDistributionByBreed = await prisma.pet.groupBy({
      by: ['breed'],
      _min: {
        weight: true
      },
      _max: {
        weight: true
      },
      _avg: {
        weight: true
      }
    });

    // Convert weight values to floats
    weightDistributionByBreed.forEach(data => {
      data._min.weight = parseFloat(data._min.weight);
      data._max.weight = parseFloat(data._max.weight);
      data._avg.weight = parseFloat(data._avg.weight);
    });
    
    // Sort the data by breed in ascending order
    weightDistributionByBreed.sort((a, b) => a.breed.localeCompare(b.breed));

    const petWeights = await prisma.pet.findMany({
      select: {
        weight: true
      }
    });

    

    const breeds = await prisma.pet.groupBy({
      by: ['breed'],
      orderBy: {
        breed: 'asc'
      }
    });

    const petss = await prisma.pet.findMany({
      orderBy: {
        createdAt: 'asc'
      }
    });
  
     
    const servicesDistribution = await prisma.pet.groupBy({
      by: ['service'],
      _count: {
        service: true
      }
    });

    
    const maleServices = await prisma.pet.findMany({
      where: {
        gender: 'male'
      },
      distinct: ['service']
    });

    const femaleServices = await prisma.pet.findMany({
      where: {
        gender: 'female'
      },
      distinct: ['service']
    });

    const chartData = [
      {
        from: 'Male',
        to: maleServices.map(service => service.service)
      },
      {
        from: 'Female',
        to: femaleServices.map(service => service.service)
      }
    ];

      
    
    res.render('admin/dashboard', { 
      title: 'Express',
      managers, 
      transactions, 
      transactionsman, 
      managerstrans, 
      servicesPerBreed, 
      maleCount, 
      femaleCount, 
      averageAgePerBreed,
      months,
      totalPetsByMonth,
      weightDistributionByBreed,
      petWeights,
      breeds,
      petss, 
      servicesDistribution,
      chartData // Pass the servicesByGender data to the template
     });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});



router.get('/add-manager', validateSession, async function(req, res, next) { 
  try {
    const managers = await prisma.manager.findMany();
    res.render('admin/add-manager', { title: 'Express', managers });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// POST add manager
router.post('/add-manager', validateSession, async function(req, res, next) {
  try {
    // Validate the request body against the defined schema
    const { error, value } = managerSchema.validate(req.body);
    if (error) {
      // If validation fails, redirect back to the add manager page with an error message
      return res.redirect('/add-manager');
    }

    const { firstName, middleName, lastName, contact, email, password } = value;

    // Sanitize the inputs
    const sanitizedFirstName = validator.escape(firstName);
    const sanitizedMiddleName = validator.escape(middleName);
    const sanitizedLastName = validator.escape(lastName);
    const sanitizedContact = validator.escape(contact);
    const sanitizedEmail = validator.normalizeEmail(email);

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new manager in the database
    const newManager = await prisma.manager.create({
      data: {
        firstName: sanitizedFirstName,
        middleName: sanitizedMiddleName,
        lastName: sanitizedLastName,
        contact: sanitizedContact,
        email: sanitizedEmail,
        password: hashedPassword,
      },
    });

    res.redirect('/add-manager'); // Redirect to the managers list page
  } catch (error) {
    console.error(error);
    res.redirect('/add-manager'); // Redirect back to the add manager page in case of an error
  }
});

// POST delete manager
router.post('/admin/delete', validateSession, async function(req, res, next) {
  const { managerId } = req.body;

  try {
    // Find the manager to be deleted
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
    });

    if (!manager) {
      return res.status(404).send('Manager not found');
    }

    // Delete the manager
    await prisma.manager.delete({
      where: { id: managerId },
    });
    console.log("SUCCESS")
    res.redirect('/admin/dashboard');
    
  } catch (error) {
    console.error(error);
    console.log("error")
    res.status(500).send('Internal Server Error');
    
  }
});


// POST route to update the manager
router.post('/admin/edit-manager', validateSession, async function(req, res, next) {
  const { managerId, firstName, middleName, lastName, contact, email, password } = req.body;

  try {
    // Find the manager to be updated
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
    });

    if (!manager) {
      return res.status(404).send('Manager not found');
    }

    // Update the manager
    const updatedManager = await prisma.manager.update({
      where: { id: managerId },
      data: {
        firstName,
        middleName,
        lastName,
        contact,
        email,
        password,
      },
    });

    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// GET route to render the admin pets page
router.get('/admin/pets', validateSession, async function(req, res, next) {
  try {
    const pets = await prisma.pet.findMany(); // Fetch all pet records
    res.render('admin/pets', { title: 'Express', pets });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});







// Helper function to get the month name from the month index (0-11)
function getMonthName(monthIndex) {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];
  return monthNames[monthIndex];
}


module.exports = router;