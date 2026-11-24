import { Router } from 'express';
import payrollRoutes from './payroll';
import {
  approveClosure,
  changeTaxRegime,
  closeCompany,
  createCompany,
  getCompany,
  listCompanies,
  reactivateCompany,
  rejectClosure,
  requestClosure,
  updateCompanyProfile,
  upsertPrimaryAddress,
} from '../controllers/companyController';

const router = Router();

router.use('/:companyId/payroll', payrollRoutes);

router.get('/', listCompanies);
router.post('/', createCompany);
router.get('/:id', getCompany);
router.put('/:id/profile', updateCompanyProfile);
router.put('/:id/primary-address', upsertPrimaryAddress);
router.post('/:id/tax-regime', changeTaxRegime);
router.post('/:id/close', closeCompany);
router.post('/:id/request-closure', requestClosure);
router.post('/:id/approve-closure', approveClosure);
router.post('/:id/reject-closure', rejectClosure);
router.post('/:id/reactivate', reactivateCompany);

export default router;
