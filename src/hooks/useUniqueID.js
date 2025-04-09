import { useState } from 'react'

export default function useUniqueID(prefix) {
	const random32BitNumber = Math.floor(Math.random() * 0xFFFFFFFF);
	const [id] = useState(prefix+random32BitNumber.toString(16).padStart(8, '0'))
	return id
}