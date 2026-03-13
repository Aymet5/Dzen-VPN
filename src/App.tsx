/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-md max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">ДзенVPN Bot</h1>
        <p className="text-gray-600">
          Бот успешно запущен и работает в Telegram!
        </p>
        <p className="text-gray-500 text-sm mt-4">
          Ожидание настройки API для генерации VLESS конфигураций.
        </p>
      </div>
    </div>
  );
}
