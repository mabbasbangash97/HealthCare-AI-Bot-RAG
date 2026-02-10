import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken, requireRole } from '../middleware/auth';
import { ReportService } from '../services/ReportService';
import { UserService } from '../services/UserService';

const router = Router();

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Unique filename: timestamp-original
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Upload Endpoint
router.post('/upload', authenticateToken, requireRole('doctor'), upload.single('file'), async (req: any, res) => {
    try {
        const { mrn, reportType, description } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!mrn) {
            return res.status(400).json({ error: 'Patient MRN is required' });
        }

        // 1. Resolve MRN to Patient
        const patient = await UserService.getPatientByMRN(mrn);
        if (!patient) {
            return res.status(404).json({ error: `Error: No patient found with MRN ${mrn}` });
        }

        // 2. Strict Privacy Check
        const doctorId = req.user.doctorId;
        const hasAccess = await UserService.verifyDoctorPatientRelationship(doctorId, patient.id);

        if (!hasAccess) {
            return res.status(403).json({
                error: `Access Denied: The patient with MRN ${mrn} is not currently assigned to you. You can only upload reports for your own patients.`
            });
        }

        const report = await ReportService.createReport(
            patient.id,
            doctorId,
            file.originalname,
            file.path,
            reportType || 'Other',
            description || ''
        );

        res.json({ success: true, report });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Failed to upload report' });
    }
});

// List Reports (Doctor View)
router.get('/patient/:id', authenticateToken, requireRole('doctor'), async (req: any, res) => {
    try {
        const patientId = parseInt(req.params.id);
        const doctorId = req.user.doctorId;

        // Privacy Check: Can this doctor view this patient?
        const hasAccess = await UserService.verifyDoctorPatientRelationship(doctorId, patientId);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied: You can only view reports for your own patients.' });
        }

        const reports = await ReportService.getReportsByPatient(patientId);
        res.json(reports);
    } catch (err) {
        console.error('Fetch reports error:', err);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

export default router;
