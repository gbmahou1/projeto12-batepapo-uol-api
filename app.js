import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv  from "dotenv";
import dayjs from 'dayjs';
import joi from 'joi';
import { Agent } from 'http';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

const mongoClient = new MongoClient(process.env.MONGO_URI);

const nameSchema = joi.object({
    name: joi.string().required().min(1)
})

app.post('/participants', async (req, res) => {
    try
    {
        await mongoClient.connect();
        const dbUol = mongoClient.db("uol_api");
        const participantsCollection = dbUol.collection("participants");
        const messagesCollection = dbUol.collection("messages");
        const { name } = req.body;
        const participantWithThisName = await participantsCollection.find({name: name}).toArray();

        if(participantWithThisName.length != 0)
        {
            return res.status(409).send("Já existe um participante com esse nome...");
        }

        if(nameSchema.validate({name: name}).error)
        {
            return res.status(422).send("Nome invalido...");
        }

        await participantsCollection.insertOne({name: name, lastStatus: Date.now()});

        await messagesCollection.insertOne({from: name, to: 'Todos', text: 'entra na sala...', type: 'status', time: dayjs().format('HH:mm:ss')});

        res.sendStatus(201);

        mongoClient.close()
    }
    catch (error)
    {
        res.status(500).send(error)
		mongoClient.close()
    }
})

app.get('/participants', async (req, res) => {
    try
    {
        await mongoClient.connect();
        const dbUol = mongoClient.db("uol_api");
        const participantsCollection = dbUol.collection("participants");
        const participantArray = await participantsCollection.find({}).toArray();

        res.send(participantArray);
        mongoClient.close()

    }
    catch (error)
    {
        res.status(500).send(error)
		mongoClient.close()
    }
})

const messageSchema = joi.object({
    to: joi.string().required().min(1),
    text: joi.string().required().min(1)
})

app.post('/messages', async (req, res) => {
    try
    {
        await mongoClient.connect();
        const dbUol = mongoClient.db("uol_api");
        const participantsCollection = dbUol.collection("participants");
        const messagesCollection = dbUol.collection("messages");

        const { to, text, type } = req.body;
        const user = req.headers.user;

        if(messageSchema.validate({to, text}).error)
        {
            return res.sendStatus(422);
        }

        if(type != 'message' && type != 'private_message')
        {
            return res.sendStatus(422);
        }

        const participantWithThisName = await participantsCollection.find({name: user}).toArray();

        if(participantWithThisName.length === 0)
        {
            return res.sendStatus(422);
        }

        await messagesCollection.insertOne({from: user, to: to, text: text, type: type, time: dayjs().format('HH:mm:ss')});

        res.sendStatus(201);
        mongoClient.close()
    }
    catch (error)
    {
        console.log(error);
        res.status(500).send(error)
		mongoClient.close()
    }
})

app.get('/messages', async (req, res) => {
    try
    {
        await mongoClient.connect();
        const dbUol = mongoClient.db("uol_api");
        const messagesCollection = dbUol.collection("messages");
        const user = req.headers.user;

        const limit = parseInt(req.query.limit);

        const publicMessages = await messagesCollection.find({type: 'message'}).toArray();
        const privateMessages = await messagesCollection.find({type: 'private_message', to: user}).toArray();
        const sentMessages = await messagesCollection.find({type: 'private_message', from: user}).toArray();

        let result = [];
        result.push.apply(result, publicMessages);
        result.push.apply(result, privateMessages);
        result.push.apply(result, sentMessages);

        result.sort(function (a, b) {
            return a.time.localeCompare(b.time);
        });

        if (!limit || limit >= result.length)
        {
            return res.send(result);
        }

        res.send(result.slice(Math.max(result.length - limit, 0)));
        mongoClient.close()
    }
    catch (error)
    {
        console.log(error);
        res.status(500).send(error)
		mongoClient.close()
    }
})

app.post('/status', async (req, res) => {
    try
    {
        await mongoClient.connect();
        const dbUol = mongoClient.db("uol_api");
        const participantsCollection = dbUol.collection("participants");

        const user = req.headers.user;

        const participantWithThisName = await participantsCollection.find({name: user}).toArray();

        if(participantWithThisName.length === 0)
        {
            return res.sendStatus(404);
        }

        await participantsCollection.updateOne({name: user}, {$set: {"lastStatus": Date.now()}})

        res.sendStatus(200);
        mongoClient.close()
    }
    catch (error)
    {
        console.log(error);
        res.status(500).send(error)
		mongoClient.close()
    }
})


function removeAfk() {
    setInterval( async () => {
    try
    {
        await mongoClient.connect();
        const dbUol = mongoClient.db("uol_api");
        const messagesCollection = dbUol.collection("messages")
        const participantsCollection = dbUol.collection("participants");

        const timeOut = Date.now() - 10000;
        const afkParticipants = await participantsCollection.find({ lastStatus: { $lte: timeOut } }).toArray();

        if (afkParticipants.length === 0)
        {
            return
        }

        await participantsCollection.deleteMany({ lastStatus: { $lte: timeOut } })
    
        let msgToChat = afkParticipants.map(el => {
            let newStatusMsg = {
                from: el.name,
                to: 'Todos',
                text: 'sai da sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss')
            }
            return newStatusMsg
          })
    
        await messagesCollection.insertMany([...msgToChat])

    }
    catch (error)
    {
        console.log(error);
        res.status(500).send(error)
		mongoClient.close()
    }
  }, 15000);
}

removeAfk();

app.listen(5000);