import { Router } from 'express';
import {
  createOffice,
  grantOfficeAccess,
  listOffices,
  listOfficeUsers,
  revokeOfficeAccess,
} from '../controllers/officeController';

const router = Router();

router.get('/', listOffices);
router.post('/', createOffice);
router.get('/users', listOfficeUsers);
router.post('/:officeId/accesses', grantOfficeAccess);
router.delete('/:officeId/accesses/:userId', revokeOfficeAccess);

export default router;
