const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// Initialize Express app
const app = express();
app.set('view engine', 'ejs');
app.use(express.json())
// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/ics', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));


  app.use(session({
    secret: 'your-secret-key', // Change to a strong secret
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: 'mongodb://127.0.0.1:27017/ics',
        collectionName: 'sessions', // Store sessions in the 'sessions' collection
        autoRemove: 'native' // Automatically remove expired sessions
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // Session expires in 1 day
}));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user:"StudySphere41@gmail.com",
        pass:"ptsa dirl vcau xtio"
    }
});

// Define User Schema and Model
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    answeredPoll: { type: Boolean, default: false },
    verified: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

// Define Poll Schema and Model
const pollSchema = new mongoose.Schema({
    question: { type: String, required: true },
    yes: { type: Number, default: 0 },
    no: { type: Number, default: 0 }
});
const Poll = mongoose.model('Poll', pollSchema);

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

function isAuthenticated(req) {
    return req.session && req.session.userId; // You can modify this based on how you store the user session
  }
  
  // Login route
  function generateCaptcha() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let captchaCode = '';
    for (let i = 0; i < 5; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        captchaCode += chars[randomIndex];
    }
    return captchaCode;
}

// Route to serve the login page with CAPTCHA
let captchas = [];

// Function to generate a CAPTCHA code
function generateCaptcha() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let captchaCode = '';
    for (let i = 0; i < 5; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        captchaCode += chars[randomIndex];
    }
    return captchaCode;
}

// Cleanup expired CAPTCHAs
function cleanupCaptchaStore() {
    const now = Date.now();
    for (const key in captchaStore) {
        if (now > captchaStore[key].expiresAt) {
            delete captchaStore[key];
        }
    }
}

// Route to serve the login page with CAPTCHA
app.get('/auth/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/poll');
    }

    // Generate new CAPTCHA and store it in captchaStore with an expiry time
    const captchaCode = generateCaptcha();
    const index = Math.random().toString(36).substring(2, 15);
    
    captchas.push({
        index:index,
        captcha:captchaCode
    })
    console.log(captchas);
    // Clean up old CAPTCHAs
    res.render('login', { index , captchaCode });
});

// Route to handle login form submission
app.post('/auth/login', async (req, res) => {
    const { email, password, captcha , index } = req.body;
    if (!captcha) {
        return res.status(400).json({message :"No Captcha Provided"})
    }
    console.log( email, password, captcha , index );
    console.log(captchas.find(c => c.index === index));
    
    if (captcha!== captchas.find(c => c.index === index).captcha) {
        return res.send("You Can't Attack Me")
    }
    // Validate CAPTCHA using captchaStore
    // Remove CAPTCHA from captchaStore once validated
   
    try {
        const user = await User.findOne({ email });
        if (!user) return res.send('User not found');
        if (!user.verified) return res.send('Please verify your email before logging in');
        if (user.password !== password) return res.send('Invalid credentials');

        req.session.userId = user._id;
        res.redirect('/poll');
    } catch (err) {
        console.error('Error logging in:', err);
        res.send('Error logging in');
    }
});

app.post('/auth/register', async (req, res) => {
    const { email, password } = req.body;
    console.log(email,password);
    
    try {
        const user = new User({ email, password });
        await user.save();

        // Send verification email
        const mailOptions = {
            from: 'pinnukoushik1@gmail.com',
            to: email,
            subject: 'Verify Your Email',
            text: `Thank you for registering. Please verify your email by clicking on the following link: http://localhost:4000/verify-email/${user._id}`
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error('Error sending email:', err);
            } else {
                console.log('Email sent:', info.response);
            }
        });

        res.json("success")
    } catch (err) {
        console.error('Error registering user:', err);
        res.send('Error registering user');
    }
});

app.get('/verify-email/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).send('User not found');
        if (user.verified) return res.send('This email is already verified');
        user.verified = true;
        await user.save();
        res.send('Your email has been successfully verified!');
    } catch (err) {
        console.error('Error verifying email:', err);
        res.status(500).send('Server error');
    }
});


app.get('/auth/logout', (req, res) => {
    // Destroy the session
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Failed to log out.');
        }
        
        // Clear the session cookie and redirect to home
        res.clearCookie('connect.sid'); // Assuming 'connect.sid' is the default cookie name
        res.redirect('/');
    });
});

// Middleware to check if the user is logged in
function ensureAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    } else {
        res.send('You are not authorized to view this page. Please log in.');
    }
}

app.get('/poll', ensureAuthenticated, async (req, res) => {
     res.sendFile(__dirname+"/poll.html")
}  
);

app.get("/user" , async (req, res) => {
    var user = req.session.userId
    User.findById(user).then(userdet => {
        res.send(userdet)
    })
})

app.post('/poll', ensureAuthenticated, async (req, res) => {
    const { poll } = req.body;
    console.log(req.body);
    
    const answer  = poll;
    const userId = req.session.userId;
    console.log(userId);
    console.log(`Vote received: ${answer}`);  // Check if this logs either 'yes' or 'no'
    if (userId === undefined) {
     return   res.status(200).send('You Cant Attack My Website');
    }
    try {
        const user = await User.findById(userId);
        if (!user || user.answeredPoll) return res.status(404).send('User not found or poll already answered');

        const poll = await Poll.findOneAndUpdate(
            { question: 'Do you like this app?' },
            { $inc: { [answer]: 1 } },
            { new: true }
        );
        user.answeredPoll = true;
        await user.save();
        res.status(200).send('Succesfully voted');
    } catch (err) {
        console.error('Error updating poll:', err);
        res.status(500).send('Server error');
    }
});

app.get('/results', async (req, res) => {
    try {
        const poll = await Poll.findOne({ question: 'Do you like this app?' });
        if (poll) {
            res.json({ yes: poll.yes, no: poll.no });
        } else {
            res.status(404).send('Poll not found');
        }
    } catch (err) {
        console.error('Error fetching poll results:', err);
        res.status(500).send('Server error');
    }
});

// Start the server
app.listen(4000, () => {
    console.log('Server running on http://localhost:3000');
});
