import { BarChart3, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui';

const INFO = {
  affiliate: {
    title: 'สตูดิโอแอฟฟิลิเอต', icon: Store,
    now: ['ใส่ลิงก์แอฟฟิลิเอตในข้อมูลสินค้า', 'เลือกสไตล์ “รีวิวแอฟฟิลิเอต” ตอนสร้างโฆษณา', 'คัดลอกลิงก์และเปิดการเปิดเผยแอฟฟิลิเอตได้ในหน้าส่งออก'],
    next: ['ฟอร์มแอฟฟิลิเอตเฉพาะ + ตรวจสอบลิงก์', 'แคปชันและกลยุทธ์ที่เน้นแอฟฟิลิเอต', 'จะไม่แสดงค่าคอมมิชชั่นจนกว่าจะเชื่อมแหล่งข้อมูลจริง'],
  },
  analytics: {
    title: 'สถิติผลงาน', icon: BarChart3,
    now: ['ดูจำนวนวิดีโอ ฉบับร่าง และการส่งออกที่หน้าแรก'],
    next: ['กรอกยอดวิว ไลก์ คลิก ยอดขายเอง', 'คำนวณ CTR และ Conversion Rate พร้อมกราฟ', 'แยกข้อมูลจริง ข้อมูลที่กรอกเอง และคำแนะนำ AI ให้ชัดเจน'],
  },
};

export default function Upcoming({ kind }: { kind: keyof typeof INFO }) {
  const i = INFO[kind];
  return (
    <div className="animate-in space-y-4">
      <PageHeader title={i.title} back />
      <div className="card p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent/20 text-violet-glow grid place-items-center mx-auto mb-3"><i.icon /></div>
        <span className="text-[12px] rounded-full bg-white/10 px-3 py-1">กำลังพัฒนา · เฟส 6</span>
        <p className="text-white/60 text-[14px] mt-3">หน้านี้ยังไม่เปิดใช้งาน และจะไม่แสดงข้อมูลตัวอย่างปลอม</p>
      </div>
      <div className="card p-4"><h3 className="font-semibold mb-2">ใช้ได้แล้วตอนนี้</h3><ul className="list-disc pl-5 text-[14px] text-white/70 space-y-1">{i.now.map((x) => <li key={x}>{x}</li>)}</ul></div>
      <div className="card p-4"><h3 className="font-semibold mb-2">กำลังจะมา</h3><ul className="list-disc pl-5 text-[14px] text-white/70 space-y-1">{i.next.map((x) => <li key={x}>{x}</li>)}</ul></div>
      <Link to="/create" className="btn-primary w-full">สร้างโฆษณาตอนนี้</Link>
    </div>
  );
}
