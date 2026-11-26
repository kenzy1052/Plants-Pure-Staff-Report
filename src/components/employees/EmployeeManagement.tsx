import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import React, { useState, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  Edit2, 
  UserX, 
  UserCheck, 
  FileText, 
  Calendar, 
  Phone, 
  Mail, 
  Building2, 
  ShieldCheck, 
  X,
  Check
} from 'lucide-react';
import { Employee, RoleDesignation, User as UserType, DailyReport } from '../../types';
import { EmployeeService } from '../../services/storageService';

interface EmployeeManagementProps {
  currentUser: UserType;
  employees: Employee[];
  roles: RoleDesignation[];
  dailyReports: DailyReport[];
  onNavigate: (view: string, param?: string) => void;
  onRefreshEmployees: () => void;
}

export const EmployeeManagement: React.FC<EmployeeManagementProps> = ({
  currentUser,
  employees,
  roles,
  dailyReports,
  onNavigate,
  onRefreshEmployees
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  // Modal states
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [formSupervisorName, setFormSupervisorName] = useState('Madam Ursula');

  // Deactivate confirmation modal state
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);

  // View staff history modal
  const [historyTarget, setHistoryTarget] = useState<Employee | null>(null);

  const isAdminOrCeo = currentUser.role === 'admin' || currentUser.role === 'ceo';

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (selectedRoleFilter !== 'all' && emp.roleId !== selectedRoleFilter) return false;
      if (selectedStatusFilter !== 'all' && emp.status !== selectedStatusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchCode = emp.employeeId.toLowerCase().includes(q);
        const matchEmail = emp.email.toLowerCase().includes(q);
        const matchRole = emp.roleTitle.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchEmail && !matchRole) return false;
      }
      return true;
    });
  }, [employees, selectedRoleFilter, selectedStatusFilter, searchQuery]);

  const handleOpenAddModal = () => {
    setEditingEmployee(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('+234 80');
    setFormEmployeeId(`PP-EMP-${Math.floor(110 + employees.length)}`);
    setFormRoleId(roles[0]?.id || 'role_agri');
    setFormSupervisorName('Madam Ursula');
    setShowAddEditModal(true);
  };

  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormName(emp.name);
    setFormEmail(emp.email);
    setFormPhone(emp.phone);
    setFormEmployeeId(emp.employeeId);
    setFormRoleId(emp.roleId);
    setFormSupervisorName(emp.supervisorName || '');
    setShowAddEditModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const roleObj = roles.find(r => r.id === formRoleId) || roles[0];
    if (!roleObj) { toast.warning('No designation available', { description: 'Add a staff designation in Settings first.' }); return; }
    try {
      if (editingEmployee) {
        await EmployeeService.updateEmployee(editingEmployee.id, {
          name: formName,
          email: formEmail,
          phone: formPhone,
          employeeId: formEmployeeId,
          roleId: roleObj.id,
          roleTitle: roleObj.title,
          department: roleObj.department,
          supervisorName: formSupervisorName
        }, currentUser);
      } else {
        await EmployeeService.createEmployee({
          employeeId: formEmployeeId,
          name: formName,
          email: formEmail,
          phone: formPhone,
          roleId: roleObj.id,
          roleTitle: roleObj.title,
          department: roleObj.department,
          supervisorName: formSupervisorName,
          status: 'active',
          dateAdded: new Date().toISOString().slice(0,10)
        }, currentUser);
      }
      setShowAddEditModal(false);
      onRefreshEmployees();
    } catch (err: any) {
      toast.error('Could not complete action', { description: `Error saving employee: ${err.message}` });
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!deactivateTarget) return;
    try {
      await EmployeeService.toggleEmployeeStatus(deactivateTarget.id, currentUser);
      setDeactivateTarget(null);
      onRefreshEmployees();
    } catch (err: any) {
      toast.error('Could not complete action', { description: `Error toggling status: ${err.message}` });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="bg-card  p-6 rounded-lg border border-border  shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal">
            Staff Directory & Permissions
          </span>
          <h1 className="text-2xl font-bold text-foreground  mt-0.5">
            Employee Roster Management
          </h1>
          <p className="text-xs text-muted-foreground  mt-0.5">
            Oversee staff profiles, assign reporting roles, configure supervisory chains, and view historical reports.
          </p>
        </div>

        {isAdminOrCeo && (
          <Button variant="legacy"
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Employee</span>
          </Button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-card  p-4 rounded-lg border border-border  shadow-xs grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-6 relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, staff ID, email, or designation..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
          />
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium"
          >
            <option value="all">All Designations</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Staff</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>
      </div>

      {/* Employees Table Card */}
      <div className="bg-card  rounded-lg border border-border  shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted  border-b border-border  text-muted-foreground  font-semibold uppercase tracking-normal text-[11px]">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Staff ID</th>
                <th className="py-3 px-4">Role & Department</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Supervisor</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border ">
              {filteredEmployees.map(emp => {
                const empReportsCount = dailyReports.filter(r => r.employeeId === emp.id).length;
                return (
                  <tr key={emp.id} className="hover:bg-muted/70 ">
                    <td className="py-3 px-4 font-medium text-foreground ">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-success-soft  text-primary  font-bold flex items-center justify-center text-xs shrink-0">
                          {emp.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground ">{emp.name}</div>
                          <div className="text-[10px] text-muted-foreground">Added {emp.dateAdded}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-foreground ">
                      {emp.employeeId}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground ">
                      <div className="font-medium text-foreground ">{emp.roleTitle}</div>
                      <div className="text-[11px] text-muted-foreground">{emp.department}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground ">
                      <div>{emp.email}</div>
                      <div className="text-[11px] text-muted-foreground">{emp.phone}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground ">
                      {emp.supervisorName || ''}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`
                        font-bold text-[11px] uppercase px-2 py-0.5 rounded
                        ${emp.status === 'active' ? 'bg-success-soft text-success  ' : 'bg-muted text-muted-foreground  '}
                      `}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="legacy"
                          onClick={() => setHistoryTarget(emp)}
                          className="p-1.5 text-muted-foreground hover:text-primary rounded hover:bg-muted "
                          title="View Reporting History"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        {isAdminOrCeo && (
                          <>
                            <Button variant="legacy"
                              onClick={() => handleOpenEditModal(emp)}
                              className="p-1.5 text-muted-foreground hover:text-primary rounded hover:bg-muted "
                              title="Edit Employee"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="legacy"
                              onClick={() => setDeactivateTarget(emp)}
                              className={`p-1.5 rounded hover:bg-muted  ${
                                emp.status === 'active' ? 'text-muted-foreground hover:text-destructive' : 'text-success hover:text-success'
                              }`}
                              title={emp.status === 'active' ? 'Deactivate Employee' : 'Activate Employee'}
                            >
                              {emp.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Employee Modal */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 bg-overlay/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-card  rounded-lg shadow-2xl max-w-lg w-full border border-border  p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border  pb-3">
              <h3 className="text-base font-bold text-foreground ">
                {editingEmployee ? 'Edit Staff Profile' : 'Register New Employee'}
              </h3>
              <Button variant="legacy" onClick={() => setShowAddEditModal(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-foreground  mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Samuel Adekunle"
                    className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground  mb-1">
                    Employee ID *
                  </label>
                  <input
                    type="text"
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    placeholder="PP-EMP-107"
                    className="w-full p-2 rounded-lg border border-border  bg-card  font-mono text-foreground "
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-foreground  mb-1">
                    Company Email *
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="samuel.a@plantsandpure.com"
                    className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground  mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+234 803 000 0000"
                    className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-foreground  mb-1">
                  Designation / Role Assignment *
                </label>
                <select
                  value={formRoleId}
                  onChange={(e) => setFormRoleId(e.target.value)}
                  className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground  font-medium"
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({r.department})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-foreground  mb-1">
                  Assigned Supervisor *
                </label>
                <select
                  value={formSupervisorName}
                  onChange={(e) => setFormSupervisorName(e.target.value)}
                  className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground  font-medium"
                >
                  <option value="Madam Ursula">Madam Ursula (Operations & Cultivation Manager)</option>
                  <option value="Dr. Tariq Al-Mansoor">Dr. Tariq Al-Mansoor (Chief Executive Officer)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border ">
                <Button variant="legacy"
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-muted-foreground  hover:bg-muted rounded-lg"
                >
                  Cancel
                </Button>
                <Button variant="legacy"
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary rounded-lg shadow-sm"
                >
                  {editingEmployee ? 'Save Changes' : 'Register Employee'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate / Activate Confirmation Dialog */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 bg-overlay/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-card  rounded-lg shadow-2xl max-w-md w-full border border-border  p-6 space-y-4">
            <h3 className="text-base font-bold text-foreground ">
              {deactivateTarget.status === 'active' ? 'Deactivate Staff Account' : 'Reactivate Staff Account'}
            </h3>
            <p className="text-xs text-muted-foreground  leading-relaxed">
              {deactivateTarget.status === 'active' ? (
                <>
                  Are you sure you want to deactivate <strong>{deactivateTarget.name}</strong>?
                  <br /><br />
                  <span className="text-success  font-semibold">
                    * Preservation guarantee: Deactivating this account will NOT delete any historical daily or weekly reports.
                  </span>
                </>
              ) : (
                <>Reactivate account for <strong>{deactivateTarget.name}</strong> to allow ongoing report submissions.</>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="legacy"
                type="button"
                onClick={() => setDeactivateTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground  hover:bg-muted rounded-lg"
              >
                Cancel
              </Button>
              <Button variant="legacy"
                type="button"
                onClick={handleConfirmToggleStatus}
                className={`px-5 py-2 text-xs font-semibold text-primary-foreground rounded-lg shadow-sm ${
                  deactivateTarget.status === 'active' ? 'bg-destructive hover:bg-destructive' : 'bg-primary hover:bg-primary'
                }`}
              >
                {deactivateTarget.status === 'active' ? 'Confirm Deactivation' : 'Confirm Reactivation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View Staff History Modal */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 bg-overlay/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-card  rounded-lg shadow-2xl max-w-2xl w-full border border-border  p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border  pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground ">
                  Reporting History: {historyTarget.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {historyTarget.employeeId} · {historyTarget.roleTitle}
                </p>
              </div>
              <Button variant="legacy" onClick={() => setHistoryTarget(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border ">
              {dailyReports.filter(r => r.employeeId === historyTarget.id).length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No historical daily reports found for this staff member.
                </div>
              ) : (
                dailyReports.filter(r => r.employeeId === historyTarget.id).map(r => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-foreground  mr-2">
                        {r.reportCode}
                      </span>
                      <span className="text-muted-foreground">{r.date} ({r.dayOfWeek})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-[10px] uppercase text-success ">
                        {r.status}
                      </span>
                      <Button variant="legacy"
                        onClick={() => {
                          setHistoryTarget(null);
                          onNavigate('daily_report_detail', r.id);
                        }}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="text-right pt-2 border-t border-border ">
              <Button variant="legacy"
                onClick={() => setHistoryTarget(null)}
                className="px-4 py-1.5 text-xs font-medium text-muted-foreground  hover:bg-muted rounded-lg"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
