const Koa = require('koa');
const cors = require('@koa/cors');
const Router = require('koa-router')
const { PrismaClient } = require('@prisma/client');
const { koaBody } = require('koa-body');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require('fs'); 
require('dotenv').config()

const app = new Koa();
const prisma = new PrismaClient();
const router = new Router()


const bucketName = process.env.BUCKET_NAME
const bucketRegion = process.env.BUCKET_REGION
const accessKey = process.env.ACCESS_KEY
const secretAccessKey = process.env.SECRET_ACCESS_KEY

const s3 = new S3Client({
    region: bucketRegion,
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretAccessKey
    }
})

app.use(koaBody({
    multipart: true,
}));
app.use(cors());

router.get("/", async (ctx)=>{
    ctx.body = {
        message: "andt 123123123 "
    }
})

router.get("/upload", async (ctx)=>{
    try {
        const imgs = await prisma.image.findMany({})

        for(const img of imgs) {
            const getObjectParam = {
                Bucket: bucketName,
                Key: img.name,
            };

            const command = new GetObjectCommand(getObjectParam);
            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
            console.log(url);
            
            img.url = url
        }
        ctx.body = {
            message: "andt 123123123 ",
            data: imgs
        }
        
    } catch (error) {
        
    }
})

router.post("/upload", async (ctx) => {
       const description = ctx.request.body?.description || '';
        const file = ctx.request.files?.file; 
        const files = Array.isArray(file) ? file : [file];


    if (!files || files.length === 0) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'No files uploaded' };
        return;
    }

    const uploadPromises = files.map(async (file) => {
        const fileStream = fs.createReadStream(file.filepath); 

        try {
            const imageName = `${Date.now()}_${file.originalFilename}`
            const uploadParams = {
                Bucket: bucketName,
                Key: imageName, 
                Body: fileStream, 
                ContentType: file.mimetype, 
            };

            await s3.send(new PutObjectCommand(uploadParams));

            await prisma.image.create({
                data: {
                    name: imageName,
                    description,
                },
            });

            return { success: true};
        } catch (error) {
            console.error(error);
            return { success: false, message: error.message };
        } finally {
            fs.unlink(file.filepath, (err) => {
                if (err) console.error('Error deleting temporary file:', err);
            });
        }
    });

    const results = await Promise.all(uploadPromises);

    ctx.body = results;
});

router.delete('/upload/:id', async (ctx) => {
    const { id } = ctx.params;

    if (!id) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Image ID is required' };
        return;
    }

    try {
        const imageToDelete = await prisma.image.findUnique({
            where: { id: +id },
        });

        if (!imageToDelete) {
            ctx.status = 404;
            ctx.body = { success: false, message: 'Image not found' };
            return;
        }

        const deleteParams = {
            Bucket: bucketName,
            Key: imageToDelete.name, 
        };

        await s3.send(new DeleteObjectCommand(deleteParams));

        await prisma.image.delete({
            where: { id: +id },
        });

        ctx.body = { success: true, message: 'Image deleted successfully' };
    } catch (error) {
        console.error(error);
        ctx.status = 500;
        ctx.body = { success: false, message: error.message };
    }
});


app.use(router.routes()).use(router.allowedMethods())

app.listen(8080).on('listening', ()=>{
    console.log('Running running')
});