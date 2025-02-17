const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: [
    "http://localhost:5175",
    "https://marathon-management-syst-f509f.web.app",
    "https://marathon-management-syst-f509f.firebaseapp.com",
  ],
  credentials: true,
  optionalSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oggyj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verifyToken
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: "unauthorized access" });
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
  });

  next();
};

async function run() {
  try {
    const marathonCollection = client
      .db("marathonManagementSystem")
      .collection("marathons");
    const usersCollection = client
      .db("marathonManagementSystem")
      .collection("users");
    const registeredCollection = client
      .db("marathonManagementSystem")
      .collection("registered-marathon");

    // generate jwt
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      // create token
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: "1d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // logout || clear cookie from browser
    app.get("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          // maxAge: 0,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // save a jobData in db
    app.post("/add-marathon", verifyToken, async (req, res) => {
      const marathonData = req.body;
      const result = await marathonCollection.insertOne(marathonData);
      res.send(result);
    });

    //get 6 marathons card for homepage from marathonCollection
    app.get("/home_marathons", async (req, res) => {
      const result = await marathonCollection.find().limit(6).toArray();
      res.send(result);
    });

    //get all marathons card from marathonCollection
    app.get("/marathons", verifyToken, async (req, res) => {
      const sort = req.query.sort;
      let options = {};
      if (sort) {
        options = {
          sort: {
            addMarathonDate: -1,
          },
        };
      }
      const result = await marathonCollection
        .find()
        .sort(options.sort)
        .toArray();
      res.send(result);
    });

    // get a single marathon details data by id from db
    app.get("/marathon/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await marathonCollection.findOne(query);
      res.send(result);
    });

    //users data
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const query = { email: newUser.email };
      const alreadyExist = await usersCollection.findOne(query);
      if (alreadyExist)
        return res.status(400).send("You have already have an account!");
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // save a registered marathon data in db
    app.post("/add-registered-marathon", verifyToken, async (req, res) => {
      const marathonData = req.body;
      const query = {
        "applicant.userEmail": marathonData.applicant.userEmail,
        competition_id: marathonData.competition_id,
      };
      const alreadyExist = await registeredCollection.findOne(query);
      if (alreadyExist) {
        return res
          .status(400)
          .send("You have already apply on this Competition!");
      }

      const result = await registeredCollection.insertOne(marathonData);

      const filter = { _id: new ObjectId(marathonData.competition_id) };
      const update = {
        $inc: { registration_count: 1 },
      };
      const updateRegistrationCount = await marathonCollection.updateOne(
        filter,
        update
      );
      res.send(result);
    });

    // get marathons data for specific user from db
    app.get("/marathon-data/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.user?.email;
      if (decodedEmail !== email) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const query = { "organizer.email": email };
      const result = await marathonCollection.find(query).toArray();
      res.send(result);
    });

    // get marathon data for update form
    app.get("/marathon-update-form/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await marathonCollection.findOne(filter);
      res.send(result);
    });

    //update marathon data for specific user
    app.put("/update-marathon/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const updated = {
        $set: updateData,
      };
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const result = await marathonCollection.updateOne(
        query,
        updated,
        options
      );
      res.send(result);
    });

    // delete a marathon from db
    app.delete("/marathon-list/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await marathonCollection.deleteOne(query);
      res.send(result);
    });

    // get registered marathons data for specific user from db
    app.get("/registered-marathon/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const search = req.query.search;
      const decodedEmail = req.user?.email;
      if (decodedEmail !== email) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      let query = {
        "applicant.userEmail": email,
      };
      if (search) {
        query["marathon_title"] = {
          $regex: search,
          $options: "i",
        };
      }

      const result = await registeredCollection.find(query).toArray();
      res.send(result);
    });

    // get registered marathon data for update form
    app.get("/update-form/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await registeredCollection.findOne(filter);
      res.send(result);
    });

    //update registration marathon data
    app.put("/update-data/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const updated = {
        $set: updateData,
      };
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const result = await registeredCollection.updateOne(
        query,
        updated,
        options
      );
      res.send(result);
    });

    // delete a registration marathon from db
    app.delete("/apply-list/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await registeredCollection.deleteOne(query);
      res.send(result);
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    //     await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Marathon management system project server side");
});

app.listen(port, () => {
  console.log(`Server is running at: ${port}`);
});
