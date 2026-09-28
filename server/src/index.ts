import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'

const app = express()
app.use(express.json())

app.get('/api/health', (req,res) =>{
	res.json({ok:true, db: mongoose.connection.readyState === 1})
})

async function main(){
	const uri = process.env.MONGODB_URI
	if (!uri) throw new  Error('MONGODB_URI is missing')
		
	await mongoose.connect(uri)
	console.log('MongoDB connected')
	
	const port = Number(process.env.PORT) || 4000
	app.listen(port, ()=> console.log(`Server on http://localhost:${port}`))
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})