// app/ui-demo/page.tsx
"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Modal,
  ConfirmModal,
  DashboardLayout
} from "@/components/ui";

export default function UIDemo() {
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [inputValue, setInputValue] = useState("");
  
  const sampleData = [
    { id: 1, name: "Ford F-150", year: 2020, mileage: "45,000", status: "active" },
    { id: 2, name: "Chevrolet Silverado", year: 2019, mileage: "62,000", status: "maintenance" },
    { id: 3, name: "Toyota Camry", year: 2021, mileage: "28,000", status: "active" },
  ];

  return (
    <DashboardLayout title="UI Component Demo" userRole="admin">
      <div className="space-y-8">
        {/* Buttons Section */}
        <Card>
          <CardHeader>
            <CardTitle>Button Components</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button variant="primary">Primary Button</Button>
              <Button variant="secondary">Secondary Button</Button>
              <Button variant="outline">Outline Button</Button>
              <Button variant="ghost">Ghost Button</Button>
              <Button variant="danger">Danger Button</Button>
              <Button variant="primary" loading>Loading...</Button>
              <Button variant="primary" disabled>Disabled</Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </CardContent>
        </Card>

        {/* Badges Section */}
        <Card>
          <CardHeader>
            <CardTitle>Badge Components</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Badge variant="primary">Primary</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <Badge size="sm">Small</Badge>
              <Badge size="md">Medium</Badge>
              <Badge size="lg">Large</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Form Components */}
        <Card>
          <CardHeader>
            <CardTitle>Form Components</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Text Input"
                placeholder="Enter some text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                helperText="This is helper text"
              />
              <Input
                label="Email Input"
                type="email"
                placeholder="user@example.com"
                variant="filled"
              />
              <Input
                label="Error State"
                placeholder="Invalid input"
                error="This field has an error"
                variant="outlined"
              />
              <Input
                label="Disabled Input"
                placeholder="Disabled"
                disabled
              />
            </div>
          </CardContent>
        </Card>

        {/* Table Section */}
        <Card>
          <CardHeader>
            <CardTitle>Table Component</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Mileage</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.year}</TableCell>
                    <TableCell>{item.mileage}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={item.status === 'active' ? 'success' : 'warning'}
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Modal Section */}
        <Card>
          <CardHeader>
            <CardTitle>Modal Components</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button onClick={() => setShowModal(true)}>
                Open Modal
              </Button>
              <Button 
                variant="danger" 
                onClick={() => setShowConfirm(true)}
              >
                Show Confirmation
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Modal Implementations */}
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Example Modal"
          size="md"
        >
          <div className="space-y-4">
            <p>This is an example modal with some content.</p>
            <Input
              label="Modal Input"
              placeholder="Type something..."
            />
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowModal(false)}>
                Save
              </Button>
            </div>
          </div>
        </Modal>

        <ConfirmModal
          isOpen={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => {
            alert("Confirmed!");
          }}
          title="Delete Item"
          message="Are you sure you want to delete this item? This action cannot be undone."
          variant="danger"
        />
      </div>
    </DashboardLayout>
  );
}