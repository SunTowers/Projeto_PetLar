/**
 * Shared test fixtures — static data used across backend test suites.
 */

export const USERS = {
  alice: {
    name: 'Alice Tester',
    email: 'alice@petlar-test.example',
    password: 'AlicePass123!',
  },
  bob: {
    name: 'Bob Tester',
    email: 'bob@petlar-test.example',
    password: 'BobPass456!',
  },
  carol: {
    name: 'Carol Tester',
    email: 'carol@petlar-test.example',
    password: 'CarolPass789!',
  },
  admin: {
    name: 'Admin Tester',
    email: 'admin@petlar-test.example',
    password: 'AdminPass000!',
  },
};

export const ANIMALS = {
  dog: {
    petName: 'Rex Teste',
    species: 'Cachorro',
    age: '24',
    gender: 'Macho',
    size: 'Médio',
    description: 'Um cachorro dócil e carinhoso criado exclusivamente para testes.',
  },
  cat: {
    petName: 'Mimi Teste',
    species: 'Gato',
    age: '12',
    gender: 'Fêmea',
    size: 'Pequeno',
    description: 'Uma gata tranquila criada exclusivamente para testes.',
  },
};
