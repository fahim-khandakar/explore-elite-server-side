const express = require("express");
const cors = require("cors");
var jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
require("dotenv").config();
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.p0m1q4c.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usersCollections = client.db("exploreDB").collection("users");
    const packagesCollections = client.db("exploreDB").collection("packages");
    const bookingsCollections = client.db("exploreDB").collection("bookings");
    const wishListCollections = client.db("exploreDB").collection("wishList");
    const storiesCollections = client.db("exploreDB").collection("stories");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
      // next();
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollections.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // users related
    app.post("/users", async (req, res) => {
      const users = req.body;
      const query = { email: users.email };
      const existingUser = await usersCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exist", insertedId: null });
      }

      const result = await usersCollections.insertOne(users);
      res.send(result);
    });

    app.get("/users", verifyToken, async (req, res) => {
      const query = { role: { $nin: ["admin"] } };
      const result = await usersCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/users/guide", async (req, res) => {
      const query = { role: { $nin: ["admin", "tourist"] } };
      const result = await usersCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/guideDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollections.findOne(query);
      res.send(result);
    });

    app.put(
      "/users/makeAdmin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollections.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    app.put(
      "/users/makeGuide/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "guide",
          },
        };
        const result = await usersCollections.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    // check admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await usersCollections.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // check guide
    app.get("/users/guide/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await usersCollections.findOne(query);
      let guide = false;
      if (user) {
        guide = user?.role === "guide";
      }
      res.send({ guide });
    });

    // package server
    app.post("/addPackage", verifyToken, verifyAdmin, async (req, res) => {
      const package = req.body;
      const result = await packagesCollections.insertOne(package);
      res.send(result);
    });

    app.get("/packages", async (req, res) => {
      const result = await packagesCollections.find().toArray();
      res.send(result);
    });

    app.get("/packageDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await packagesCollections.findOne(query);
      res.send(result);
    });

    // bookings server
    app.post("/addBooking", async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollections.insertOne(booking);
      res.send(result);
    });

    app.get("/bookings", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: "Email parameter is missing." });
      }
      const query = { email: email };
      const result = await bookingsCollections.find(query).toArray();
      res.send(result);
    });

    app.put("/bookingCancel/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "rejected",
        },
      };
      const result = await bookingsCollections.updateOne(query, updatedDoc);
      res.send(result);
    });

    // wishList server
    app.post("/addWish", verifyToken, async (req, res) => {
      const wish = req.body;

      const result = await wishListCollections.insertOne(wish);
      res.send(result);
    });

    app.get("/wishes", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: "Email parameter is missing." });
      }
      const query = { user: email };
      const result = await wishListCollections.find(query).toArray();
      res.send(result);
    });

    app.delete("/deleteWish/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishListCollections.deleteOne(query);
      res.send(result);
    });

    // category data server
    app.get("/byType/:type", async (req, res) => {
      const category = req.params.type;
      console.log(category);
      const query = { type: category };
      const result = await packagesCollections.find(query).toArray();
      res.send(result);
    });

    // story server
    app.post("/addStory", verifyToken, async (req, res) => {
      const story = req.body;
      const result = await storiesCollections.insertOne(story);
      res.send(result);
    });

    app.get("/allStory", async (req, res) => {
      const result = await storiesCollections.find().toArray();
      res.send(result);
    });

    app.get("/storyDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await storiesCollections.findOne(query);
      res.send(result);
    });

    // assing tours server
    app.get("/assignTours", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = {
        "guide.email": email,
        status: { $ne: "rejected" },
      };
      const result = await bookingsCollections.find(query).toArray();
      res.send(result);
    });

    app.put("/assignTourCancel/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "rejected",
        },
      };
      const result = await bookingsCollections.updateOne(query, updatedDoc);
      res.send(result);
    });

    app.put("/assignTourAccept/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "accepted",
        },
      };
      const result = await bookingsCollections.updateOne(query, updatedDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Explore Elite is running");
});

app.listen(port, () => {
  console.log(`Explore Elite is running on port ${port}`);
});
