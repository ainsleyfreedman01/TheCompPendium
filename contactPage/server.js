require('dotenv').config();  // This loads the .env file locally (not needed on Heroku, as it's set through the dashboard)

// Use the environment variable for your password or secret key
const password = process.env.PASSWORD;  // Retrieve password from environment variable

const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const app = express();

const port = process.env.PORT || 4000;  // Default to 4000 if $PORT is not set


// Define the project root path
const projectRoot = path.resolve(__dirname, '..');  // Going one level up to the project root

// Middleware to serve static files from the mainPage directory
app.use(express.static(path.join(projectRoot, 'mainPage')));
app.use('/images', express.static(path.join(projectRoot, 'images')));
app.use('/aboutPage', express.static(path.join(projectRoot, 'aboutPage')));
app.use('/contactPage', express.static(path.join(projectRoot, 'contactPage')));
app.use('/mainPage', express.static(path.join(projectRoot, 'mainPage')));
app.use('/blog-posts', express.static(path.join(projectRoot, 'blog-posts')));

// Middleware to parse POST data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Default route for the home page (located in mainPage folder)
app.get('/', (req, res) => {
    // Correct path to mainPage/index.html from project root
    res.sendFile(path.join(projectRoot, 'mainPage', 'index.html'));
});

// Send email route
app.post('/send-email', (req, res) => {
    const { name, email, message } = req.body;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'ainsleyfreedman01@thecomppendium.com',
            pass: password,
        },
    });

    const mailOptions = {
        from: 'ainsleyfreedman01@thecomppendium.com',
        to: 'ainsleyfreedman01@gmail.com',
        subject: 'Feedback from The CompPendium',
        text: `Name: ${name}\nEmail: ${email}\n\nMessage: ${message}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Email sent:!');
            res.send('Message has been sent successfully.');
        }
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});